import http from 'http';
// Fake OpenAI-compatible LLM: scripted behaviour so we can test our tool loop without a real key.
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = JSON.parse(body);
    const msgs = j.messages;
    const last = msgs[msgs.length - 1];
    const sys = msgs[0].content;
    const reply = (message) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message }] })); };
    if (sys.includes('Turn the employee')) return reply({ role: 'assistant', content: '```json\n{"type":"casual","start":"2026-10-26","end":"2026-10-27","reason":"Sister wedding"}\n```' });
    if (sys.includes('dashboard insights')) return reply({ role: 'assistant', content: '- Headcount is ' + JSON.parse(last.content).headcount + '\n- Attendance is steady' });
    if (last.role === 'tool') return reply({ role: 'assistant', content: 'TOOL RESULT: ' + last.content.slice(0, 300) });
    const q = last.content.toLowerCase();
    const call = (name, args) => reply({ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
    if (q.includes('salary')) return call('search_employees', { query: 'Sara' });
    if (q.includes('on leave')) return call('get_leave_summary', {});
    if (q.includes('sick')) return call('get_my_leave_balance', {});
    return reply({ role: 'assistant', content: 'plain answer; offered tools: ' + (j.tools || []).map((t) => t.function.name).join(',') });
  });
}).listen(6060, () => console.log('mock llm up'));
