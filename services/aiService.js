import AiLog from '../models/AiLog.js';
import AppError from '../utils/AppError.js';
import { toolsForRole, runTool } from './aiTools.js';
import { companyKpis, adminDashboard } from './dashboardService.js';
import { getSettings } from './settingsService.js';
import { todayStr, toDateStr } from '../utils/dateUtils.js';
import { isDateString } from '../utils/validate.js';

const MAX_PER_HOUR = 20;
const TIMEOUT_MS = 15000;
const LEAVE_TYPES = ['annual', 'sick', 'casual', 'unpaid'];

// Rules from the brief (Section 3). The model may answer policy questions ONLY from this.
const POLICY = `
ATTENDANCE: Office starts 09:00, grace 15 minutes (late after 09:15). Half day = worked under 5 hours.
Weekend is Saturday and Sunday. One attendance record per employee per day. Absent = no record and no approved leave.
Missing checkout = checked in but never checked out. The server stamps the time.
LEAVE: Working days only (weekends and public holidays are skipped). Yearly quotas: annual 14, sick 8, casual 10, unpaid unlimited.
Overlapping leave or going over the balance is rejected. HR approves or rejects leave with a comment.
PAYROLL: Gross = 1.5 x basic (HRA 40%, medical 10%). Per day = gross / working days in the month.
Deductions = absent days + unpaid leave days + 0.5 x half days. Joiners and leavers are prorated.
Tax is calculated on gross x 12: up to 600k none; 5% to 1.2M; 30k + 15% to 2.4M; 210k + 25% to 3.6M; 510k + 35% above.
HR prepares the monthly draft, only Admin can finalize it, and finalized payroll is locked.
ROLES: Admin = company setup and finalizing payroll. HR = employees, attendance, leave approval, payroll draft. Employee = own data only.
`;

function checkConfigured() {
  if (!process.env.AI_API_KEY) throw new AppError(503, 'The AI assistant is not available right now (AI key is not configured). Please use the normal screens.');
}

// Max about 20 AI requests per user per hour
async function checkRateLimit(user) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const used = await AiLog.countDocuments({ user: user._id, createdAt: { $gte: since } });
  if (used >= MAX_PER_HOUR) throw new AppError(429, 'AI limit reached (20 requests per hour). Please try again later.');
}

// One call to the hosted LLM. The key lives only in the backend .env
async function callLLM(messages, tools, deadline) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(deadline - Date.now(), 1000));
  try {
    const body = { model: process.env.AI_MODEL, messages, temperature: 0.2 };
    if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
    const res = await fetch(`${process.env.AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`AI provider error ${res.status}: ${detail}`);
    }
    const data = await res.json();
    return data.choices[0].message;
  } finally {
    clearTimeout(timer);
  }
}

// Wrap an AI task: config check, rate limit, friendly failure, logging
async function guarded(user, kind, prompt, task) {
  checkConfigured();
  await checkRateLimit(user);
  const log = { user: user._id, kind, prompt: String(prompt).slice(0, 1000), toolsUsed: [] };
  try {
    const result = await task(log);
    await AiLog.create({ ...log, answer: JSON.stringify(result).slice(0, 2000), success: true });
    return result;
  } catch (err) {
    console.error('[AI] failed:', err.message, err.cause ? `(${err.cause.message || err.cause})` : '');
    await AiLog.create({ ...log, success: false, error: err.message });
    if (err instanceof AppError) throw err;
    const message = err.name === 'AbortError'
      ? 'The AI took too long to answer. Please try again.'
      : 'The AI assistant could not answer right now. Please try again or use the normal screens.';
    throw new AppError(502, message);
  }
}

// ---------- 1. Chat with tools ----------
async function chat(user, message, history = []) {
  if (!message || !String(message).trim()) throw new AppError(400, 'Please type a question');
  return guarded(user, 'chat', message, async (log) => {
    const settings = await getSettings();
    const system = `You are the HR assistant of ${settings.companyName}, talking to ${user.name} (role: ${user.role}). Today is ${todayStr()}.
Rules:
- For any number or list about people, attendance, leave or payroll, CALL A TOOL. Never invent data. If a tool returns nothing, say so.
- You only have the access of this user. If a tool returns FORBIDDEN, or the user asks for another person's salary or private data, politely refuse.
- For questions about company rules, answer ONLY from the POLICY below. If it is not there, say you do not know.
- When calling a tool, OMIT optional arguments you do not need. Never pass null for an argument.
- Reply in the same language the user writes in (English, Urdu or Roman Urdu). Keep answers short and clear.
POLICY:${POLICY}`;

    const messages = [
      { role: 'system', content: system },
      ...history.slice(-6).filter((m) => ['user', 'assistant'].includes(m.role)).map((m) => ({ role: m.role, content: String(m.content).slice(0, 1000) })),
      { role: 'user', content: String(message).slice(0, 1000) },
    ];
    const tools = toolsForRole(user.role);
    const deadline = Date.now() + TIMEOUT_MS;

    for (let step = 0; step < 4; step++) {
      const reply = await callLLM(messages, tools, deadline);
      if (!reply.tool_calls || !reply.tool_calls.length) {
        return { answer: reply.content || 'I do not have an answer for that.', toolsUsed: log.toolsUsed, aiGenerated: true };
      }
      messages.push(reply);
      for (const call of reply.tool_calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch (e) { args = {}; }
        log.toolsUsed.push(call.function.name);
        const result = await runTool(user, call.function.name, args); // runs with THIS user's permissions
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return { answer: 'I could not finish that request. Please try a simpler question.', toolsUsed: log.toolsUsed, aiGenerated: true };
  });
}

// ---------- 2. Dashboard summary (Admin, HR) ----------
async function summarize(user, query) {
  return guarded(user, 'summary', JSON.stringify(query), async () => {
    const kpis = user.role === 'ADMIN' ? await adminDashboard(query) : await companyKpis(query);
    // Only send numbers, not announcements or audit rows
    const { announcements, auditFeed, ...numbers } = kpis;
    const reply = await callLLM([
      { role: 'system', content: 'You write short HR dashboard insights. Use ONLY the numbers in the JSON. Return 3 to 5 bullet points starting with "- ". Do not invent numbers.' },
      { role: 'user', content: JSON.stringify(numbers) },
    ], null, Date.now() + TIMEOUT_MS);
    const bullets = (reply.content || '').split('\n').map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 5);
    return { bullets, aiGenerated: true };
  });
}

// ---------- 3. Smart leave (Employee) ----------
// Gives the model a small calendar so "next Monday" is not guessed
function upcomingCalendar() {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const lines = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    lines.push(`${toDateStr(d)} ${names[d.getDay()]}${i === 0 ? ' (today)' : ''}`);
  }
  return lines.join('\n');
}

function parseLeaveJson(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data;
  try { data = JSON.parse(match[0]); } catch (e) { return null; }
  const leave = { type: data.type, start: data.start, end: data.end || data.start, reason: data.reason || '' };
  if (!LEAVE_TYPES.includes(leave.type)) return null;
  if (!isDateString(leave.start) || !isDateString(leave.end) || leave.end < leave.start) return null;
  if (leave.start < todayStr()) return null;
  return leave;
}

async function smartLeave(user, sentence) {
  if (!sentence || !String(sentence).trim()) throw new AppError(400, 'Please describe the leave you need');
  return guarded(user, 'smart_leave', sentence, async () => {
    const messages = [
      { role: 'system', content: `Turn the employee's sentence into a leave request. Reply with ONLY a JSON object: {"type":"annual|sick|casual|unpaid","start":"YYYY-MM-DD","end":"YYYY-MM-DD","reason":"short text"}.
Use this calendar to resolve words like "next Monday" or "tomorrow" (the first matching day after today):
${upcomingCalendar()}
Weddings, family events and personal errands are "casual". Illness is "sick". Holidays and vacations are "annual". The sentence may be in English, Urdu or Roman Urdu.` },
      { role: 'user', content: String(sentence).slice(0, 500) },
    ];
    // Validate the JSON; retry once; then fall back to the normal form
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = await callLLM(messages, null, Date.now() + TIMEOUT_MS);
      const leave = parseLeaveJson(reply.content);
      if (leave) return { leave, aiGenerated: true }; // NOT saved: the user must confirm the form
    }
    throw new AppError(422, 'I could not understand the dates. Please fill the leave form yourself.');
  });
}

export { chat, summarize, smartLeave };