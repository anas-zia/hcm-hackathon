const B = 'http://localhost:5055/api';
let pass = 0, fail = 0;
async function call(method, path, body, token) {
  const res = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
function check(name, cond, extra) { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra ? JSON.stringify(extra) : ''); } }

const setupStatus = await call('GET', '/auth/setup-status');
check('fresh install: setupDone false', setupStatus.data.setupDone === false, setupStatus);

const setup = await call('POST', '/auth/setup', { companyName: 'Acme', name: 'Admin', email: 'admin@acme.com', password: 'admin123' });
check('first-run setup', setup.status === 201, setup);
const admin = setup.data.token;
check('second setup refused', (await call('POST', '/auth/setup', { companyName: 'X', name: 'A', email: 'a@a.com', password: 'abcdef' })).status === 409);

const dept = await call('POST', '/org/departments', { name: 'Engineering' }, admin);
check('create department', dept.status === 201, dept);
const dept2 = await call('POST', '/org/departments', { name: 'Sales' }, admin);

const hrCreate = await call('POST', '/org/hr', { name: 'Hina HR', email: 'hr@acme.com' }, admin);
check('admin creates HR', hrCreate.status === 201, hrCreate);
let hrLogin = await call('POST', '/auth/login', { email: 'hr@acme.com', password: hrCreate.data.temporaryPassword });
check('HR login with temp password', hrLogin.status === 200 && hrLogin.data.user.mustChangePassword === true, hrLogin);
let hr = hrLogin.data.token;
check('HR blocked before password change', (await call('GET', '/employees', null, hr)).status === 403);
const chg = await call('POST', '/auth/change-password', { currentPassword: hrCreate.data.temporaryPassword, newPassword: 'hrpass123' }, hr);
check('HR changes password', chg.status === 200, chg);

check('HR cannot create HR', (await call('POST', '/org/hr', { name: 'x', email: 'x@x.com' }, hr)).status === 403);
check('HR cannot change settings', (await call('PUT', '/org/settings', { companyName: 'Hack' }, hr)).status === 403);

// employees
const e1 = await call('POST', '/employees', { name: 'Ali Raza', email: 'ali@acme.com', department: dept.data._id, designation: 'Developer', joinDate: '2026-09-01', basicSalary: 100000, gender: 'male' }, hr);
check('HR registers employee 1', e1.status === 201, e1);
const e2 = await call('POST', '/employees', { name: 'Sara Khan', email: 'sara@acme.com', department: dept2.data._id, designation: 'Sales Rep', joinDate: '2026-09-01', basicSalary: 80000, gender: 'female' }, hr);
check('HR registers employee 2', e2.status === 201, e2);
check('duplicate email = 409', (await call('POST', '/employees', { name: 'Dup', email: 'ali@acme.com', department: dept.data._id, designation: 'x', joinDate: '2026-09-01', basicSalary: 1 }, hr)).status === 409);
check('Admin cannot register employee', (await call('POST', '/employees', {}, admin)).status === 403);
check('salary must be > 0', (await call('POST', '/employees', { name: 'Z', email: 'z@acme.com', department: dept.data._id, designation: 'x', joinDate: '2026-09-01', basicSalary: 0 }, hr)).status === 400);

const login1 = await call('POST', '/auth/login', { email: 'ali@acme.com', password: e1.data.temporaryPassword });
let ali = login1.data.token;
await call('POST', '/auth/change-password', { currentPassword: e1.data.temporaryPassword, newPassword: 'ali12345' }, ali);
const login2 = await call('POST', '/auth/login', { email: 'sara@acme.com', password: e2.data.temporaryPassword });
let sara = login2.data.token;
await call('POST', '/auth/change-password', { currentPassword: e2.data.temporaryPassword, newPassword: 'sara12345' }, sara);

// data scope
const list = await call('GET', '/employees', null, ali);
check('employee list scoped to own row', list.data.items.length === 1 && list.data.items[0].name === 'Ali Raza', list.data);
check('employee cannot open colleague', (await call('GET', '/employees/' + e2.data.employee._id, null, ali)).status === 403);
check('employee cannot edit salary of self (ignored)', (await call('PUT', '/employees/' + e1.data.employee._id, { basicSalary: 999999, phone: '0300' }, ali)).data.basicSalary === 100000);
check('employee cannot read payroll runs', (await call('GET', '/payroll', null, ali)).status === 403);
check('employee cannot read audit', (await call('GET', '/audit', null, ali)).status === 403);
check('employee cannot approve leave', (await call('PATCH', '/leaves/abc/approve', {}, ali)).status === 403);

// attendance
const ci = await call('POST', '/attendance/check-in', null, ali);
check('check-in', ci.status === 201, ci);
check('second check-in = 409', (await call('POST', '/attendance/check-in', null, ali)).status === 409);
const co = await call('POST', '/attendance/check-out', null, ali);
check('check-out (short day => half_day)', co.status === 200 && co.data.status === 'half_day', co.data);
check('HR cannot check in', (await call('POST', '/attendance/check-in', null, hr)).status === 403);
const board = await call('GET', '/attendance/board', null, hr);
check('HR board lists employees', board.status === 200 && board.data.length === 2, board);

// leave: 2026-10-24 is Saturday; next Mon/Tue = 26,27 Oct
const lv = await call('POST', '/leaves', { type: 'casual', startDate: '2026-10-26', endDate: '2026-10-27', reason: 'Wedding' }, ali);
check('apply leave (2 working days)', lv.status === 201 && lv.data.days === 2, lv);
check('overlap = 422', (await call('POST', '/leaves', { type: 'casual', startDate: '2026-10-27', endDate: '2026-10-28' }, ali)).status === 422);
check('weekend only = 422', (await call('POST', '/leaves', { type: 'casual', startDate: '2026-10-31', endDate: '2026-11-01' }, ali)).status === 422);
check('over balance = 422', (await call('POST', '/leaves', { type: 'sick', startDate: '2026-11-02', endDate: '2026-11-30' }, ali)).status === 422);
check('reject needs comment', (await call('PATCH', `/leaves/${lv.data._id}/reject`, {}, hr)).status === 400);
const ap = await call('PATCH', `/leaves/${lv.data._id}/approve`, { comment: 'Enjoy' }, hr);
check('HR approves leave', ap.status === 200 && ap.data.status === 'approved', ap);
check('re-approve = 409', (await call('PATCH', `/leaves/${lv.data._id}/approve`, {}, hr)).status === 409);
const bal = await call('GET', '/leaves/balance', null, ali);
check('balance casual 8 left', bal.data.casual.remaining === 8, bal.data);
const ns = await call('GET', '/notifications', null, ali);
check('employee notified of decision', ns.data.length >= 1, ns.data);

// dashboards
const hrDash = await call('GET', '/dashboard/hr', null, hr);
check('HR dashboard works', hrDash.status === 200 && hrDash.data.headcount === 2 && hrDash.data.presentToday === 1, hrDash.data);
const adDash = await call('GET', '/dashboard/admin', null, admin);
check('Admin dashboard works', adDash.status === 200 && adDash.data.headcount === 2, adDash.data);
const emDash = await call('GET', '/dashboard/employee', null, ali);
check('Employee dashboard works', emDash.status === 200 && emDash.data.leaveBalance.casual.remaining === 8, emDash.data);
check('Employee cannot open HR dashboard', (await call('GET', '/dashboard/hr', null, ali)).status === 403);
const onLeave = await call('GET', '/dashboard/hr?from=2026-10-26&to=2026-10-27', null, hr);
check('filters accepted', onLeave.status === 200);

// payroll for September (past month: absences counted)
const run = await call('POST', '/payroll/run', { month: '2026-09' }, hr);
check('HR runs payroll', run.status === 201 && run.data.items.length === 2, run);
if (run.status === 201) {
  const item = run.data.items.find((i) => i.employeeName === 'Ali Raza');
  const wd = item.workingDays;
  console.log('   Ali Sept: workingDays', wd, 'gross', item.gross, 'absent', item.absentDays, 'deduction', item.deduction, 'tax', item.tax, 'net', item.net);
  check('gross = 1.5 x basic', item.gross === 150000);
  check('absent = all working days (no records)', item.absentDays === wd, item);
}
check('Admin cannot run payroll', (await call('POST', '/payroll/run', { month: '2026-09' }, admin)).status === 403);
check('HR cannot finalize', (await call('POST', `/payroll/${run.data._id}/finalize`, null, hr)).status === 403);
check('employee sees no payslip before finalize', (await call('GET', '/payroll/my', null, ali)).data.length === 0);
const fin = await call('POST', `/payroll/${run.data._id}/finalize`, null, admin);
check('Admin finalizes', fin.status === 200 && fin.data.status === 'finalized', fin);
check('rerun finalized month = 409', (await call('POST', '/payroll/run', { month: '2026-09' }, hr)).status === 409);
const slips = await call('GET', '/payroll/my', null, ali);
check('employee gets own payslip only', slips.data.length === 1 && slips.data[0].employeeName === 'Ali Raza', slips.data);

// AI without key => friendly 503, and permission layer
const chat = await call('POST', '/ai/chat', { message: 'hi' }, ali);
check('AI without key: friendly 503', chat.status === 503, chat);
check('HR cannot use smart leave', (await call('POST', '/ai/smart-leave', { sentence: 'x' }, hr)).status === 403);
check('Employee cannot use summary', (await call('POST', '/ai/summary', {}, ali)).status === 403);

// audit
const audit = await call('GET', '/audit', null, admin);
check('audit log has entries', audit.status === 200 && audit.data.length >= 8, audit.data?.length);
check('audit has finalize', audit.data.some((a) => a.action === 'finalize'));

// deactivate
const users = await call('GET', '/org/users', null, admin);
const saraUser = users.data.find((u) => u.email === 'sara@acme.com');
await call('PATCH', `/org/users/${saraUser._id}/active`, { active: false }, admin);
check('deactivated user cannot use old token', (await call('GET', '/auth/me', null, sara)).status === 401);
check('deactivated user cannot login', (await call('POST', '/auth/login', { email: 'sara@acme.com', password: 'sara12345' })).status === 403);

console.log(`\n${pass} passed, ${fail} failed`);
