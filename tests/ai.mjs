const B = 'http://localhost:5055/api';
let pass = 0, fail = 0;
async function call(method, path, body, token) {
  const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
const check = (n, c, x) => { c ? (pass++, console.log('PASS', n)) : (fail++, console.log('FAIL', n, JSON.stringify(x))); };

const setup = await call('POST', '/auth/setup', { companyName: 'Acme', name: 'Admin', email: 'admin@acme.com', password: 'admin123' });
const admin = setup.data.token;
const dept = await call('POST', '/org/departments', { name: 'Engineering' }, admin);
const hrc = await call('POST', '/org/hr', { name: 'Hina', email: 'hr@acme.com' }, admin);
let hr = (await call('POST', '/auth/login', { email: 'hr@acme.com', password: hrc.data.temporaryPassword })).data.token;
await call('POST', '/auth/change-password', { currentPassword: hrc.data.temporaryPassword, newPassword: 'hrpass123' }, hr);
const mk = async (name, email) => {
  const e = await call('POST', '/employees', { name, email, department: dept.data._id, designation: 'Dev', joinDate: '2026-09-01', basicSalary: 90000 }, hr);
  const t = (await call('POST', '/auth/login', { email, password: e.data.temporaryPassword })).data.token;
  await call('POST', '/auth/change-password', { currentPassword: e.data.temporaryPassword, newPassword: 'pass12345' }, t);
  return t;
};
const ali = await mk('Ali', 'ali@acme.com');
await mk('Sara', 'sara@acme.com');

// leave for today so "who is on leave" has data: apply for Monday and check the tool through a later date instead
const lv = await call('POST', '/leaves', { type: 'casual', startDate: '2026-10-26', endDate: '2026-10-27', reason: 'x' }, ali);
await call('PATCH', `/leaves/${lv.data._id}/approve`, { comment: 'ok' }, hr);

const sl = await call('POST', '/ai/smart-leave', { sentence: 'I need next Monday and Tuesday off for my sister wedding' }, ali);
check('smart leave parses fenced JSON', sl.status === 200 && sl.data.leave.type === 'casual' && sl.data.leave.start === '2026-10-26', sl);

const sum = await call('POST', '/ai/summary', { from: '2026-10-01', to: '2026-10-24' }, hr);
check('dashboard summary bullets', sum.status === 200 && sum.data.bullets.length === 2 && sum.data.bullets[0].includes('2'), sum);

const emp = await call('POST', '/ai/chat', { message: "What is Sara's salary?" }, ali);
check('employee asking salary: search_employees NOT offered, tool refused', emp.status === 200 && emp.data.answer.includes('FORBIDDEN'), emp);
check('employee tool list excludes staff tools', (await call('POST', '/ai/chat', { message: 'hello' }, ali)).data.answer.includes('get_my_leave_balance') && !(await call('POST', '/ai/chat', { message: 'hello' }, ali)).data.answer.includes('search_employees'));

const bal = await call('POST', '/ai/chat', { message: 'How many sick leaves do I have left?' }, ali);
check('employee balance via tool = 8 sick', bal.data.answer.includes('"remaining":8') && bal.data.toolsUsed[0] === 'get_my_leave_balance', bal.data);

const hrq = await call('POST', '/ai/chat', { message: 'Who is on leave today?' }, hr);
check('HR leave summary tool works', hrq.status === 200 && hrq.data.toolsUsed[0] === 'get_leave_summary' && hrq.data.answer.includes('onLeave'), hrq.data);

const hrsal = await call('POST', '/ai/chat', { message: "Sara's salary?" }, hr);
check('HR may search employees (staff scope)', hrsal.data.answer.includes('basicSalary'), hrsal.data);

// rate limit: 20/hour
let last;
for (let i = 0; i < 20; i++) last = await call('POST', '/ai/chat', { message: 'hello' }, ali);
check('rate limit 429 after 20/hour', last.status === 429, last);
console.log(`\n${pass} passed, ${fail} failed`);
