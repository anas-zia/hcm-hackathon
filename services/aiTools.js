import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import Leave from '../models/Leave.js';
import Payroll from '../models/Payroll.js';
import { companyKpis } from './dashboardService.js';
import { getDayStatuses } from './attendanceService.js';
import { getBalance } from './leaveService.js';
import { todayStr } from '../utils/dateUtils.js';

/*
 * AI tools. The model only PICKS a tool and its arguments.
 * Our code runs it with the logged-in user's role, using the same services as the REST API.
 * The model never touches MongoDB directly.
 */

const STAFF = ['ADMIN', 'HR'];
const ALL = ['ADMIN', 'HR', 'EMPLOYEE'];

// "Engineering" -> department id (null if not found / not given)
async function departmentId(name) {
  if (!name) return null;
  const dept = await Department.findOne({ name: new RegExp(`^${name.trim()}$`, 'i') });
  if (!dept) throw new Error(`Unknown department "${name}"`);
  return String(dept._id);
}

// Optional arguments are nullable: some models send null instead of leaving them out, and the provider validates the schema.
const dateArgs = {
  from: { type: ['string', 'null'], description: 'Start date YYYY-MM-DD (default: first day of this month)' },
  to: { type: ['string', 'null'], description: 'End date YYYY-MM-DD (default: today)' },
  department: { type: ['string', 'null'], description: 'Department name (optional)' },
};

const tools = [
  {
    name: 'get_headcount',
    roles: STAFF,
    description: 'Number of active employees, total and per department.',
    parameters: { type: 'object', properties: { department: dateArgs.department } },
    async run(user, args) {
      const k = await companyKpis({ department: await departmentId(args.department) });
      return { headcount: k.headcount, byDepartment: k.departments.map((d) => ({ department: d.department, headcount: d.headcount })) };
    },
  },
  {
    name: 'get_attendance_summary',
    roles: ALL,
    description: 'Attendance rate and today\'s numbers (present, late, on leave). Employees get their own summary.',
    parameters: { type: 'object', properties: dateArgs },
    async run(user, args) {
      if (user.role === 'EMPLOYEE') {
        const emp = await Employee.findById(user.employee).lean();
        const k = await companyKpis({ from: args.from, to: args.to });
        const mine = await getDayStatuses([emp], k.filters.from, k.filters.to);
        const counts = {};
        mine.forEach((s) => { counts[s.status] = (counts[s.status] || 0) + 1; });
        return { range: k.filters, myDays: counts };
      }
      const k = await companyKpis({ from: args.from, to: args.to, department: await departmentId(args.department) });
      return {
        range: k.filters, attendanceRatePercent: k.attendanceRate, presentToday: k.presentToday,
        lateToday: k.lateToday, onLeaveToday: k.onLeaveToday, departments: k.departments,
      };
    },
  },
  {
    name: 'get_late_comers',
    roles: STAFF,
    description: 'Top 5 employees who came late most often in the date range.',
    parameters: { type: 'object', properties: dateArgs },
    async run(user, args) {
      const k = await companyKpis({ from: args.from, to: args.to, department: await departmentId(args.department) });
      return { range: k.filters, topLateComers: k.topLateComers };
    },
  },
  {
    name: 'get_leave_summary',
    roles: STAFF,
    description: 'Who is on approved leave on a given date (default today), plus approved leave days by type and pending requests.',
    parameters: { type: 'object', properties: { date: { type: ['string', 'null'], description: 'YYYY-MM-DD (default today)' }, ...dateArgs } },
    async run(user, args) {
      const date = args.date || todayStr();
      const onLeave = await Leave.find({ status: 'approved', startDate: { $lte: date }, endDate: { $gte: date } })
        .populate('employee', 'name code').lean();
      const k = await companyKpis({ from: args.from, to: args.to, department: await departmentId(args.department) });
      return {
        date,
        onLeave: onLeave.map((l) => ({ name: l.employee.name, type: l.type, from: l.startDate, to: l.endDate })),
        leaveDaysByType: k.leaveByType,
        pendingRequests: k.pendingApprovals,
      };
    },
  },
  {
    name: 'get_my_leave_balance',
    roles: ALL,
    description: 'The logged-in employee\'s own leave balance for this year (quota, used, pending, remaining per type).',
    parameters: { type: 'object', properties: {} },
    async run(user) {
      if (!user.employee) return { message: 'This account is not an employee, so it has no leave balance.' };
      return getBalance(user.employee);
    },
  },
  {
    name: 'get_payroll_summary',
    roles: ALL,
    description: 'Payroll totals per month (HR/Admin) or the employee\'s own latest payslip (Employee).',
    parameters: { type: 'object', properties: { month: { type: ['string', 'null'], description: 'YYYY-MM (optional)' } } },
    async run(user, args) {
      if (user.role === 'EMPLOYEE') {
        const run = await Payroll.findOne({ status: 'finalized', 'items.employee': user.employee, ...(args.month && { month: args.month }) }).sort({ month: -1 }).lean();
        if (!run) return { message: 'No finalized payslip yet.' };
        const mine = run.items.find((i) => String(i.employee) === String(user.employee));
        return { month: run.month, gross: mine.gross, deduction: mine.deduction, tax: mine.tax, net: mine.net };
      }
      const filter = args.month ? { month: args.month } : {};
      const runs = await Payroll.find(filter).sort({ month: -1 }).limit(6).lean();
      return runs.map((r) => ({ month: r.month, status: r.status, employees: r.items.length, totalGross: r.totalGross, totalNet: r.totalNet }));
    },
  },
  {
    name: 'search_employees',
    roles: STAFF,
    description: 'Find employees by name, code or email. Returns job details (HR/Admin only).',
    parameters: { type: 'object', properties: { query: { type: ['string', 'null'], description: 'Name, code or email to search (optional)' }, department: dateArgs.department } },
    async run(user, args) {
      const filter = {};
      if (args.query) filter.$or = ['name', 'email', 'code'].map((f) => ({ [f]: new RegExp(args.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
      const dept = await departmentId(args.department);
      if (dept) filter.department = dept;
      const list = await Employee.find(filter).populate('department', 'name').limit(10).lean();
      return list.map((e) => ({
        name: e.name, code: e.code, department: e.department && e.department.name,
        designation: e.designation, status: e.status, joinDate: e.joinDate, basicSalary: e.basicSalary,
      }));
    },
  },
];

// Tool definitions in the OpenAI "function calling" format, only the ones this role may use
function toolsForRole(role) {
  return tools.filter((t) => t.roles.includes(role)).map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

// Permission check happens HERE as well, in case the model asks for a tool it was not offered
async function runTool(user, name, args) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}` };
  if (!tool.roles.includes(user.role)) {
    return { error: 'FORBIDDEN', message: 'You are not allowed to see this data. Politely refuse and explain it is restricted by role.' };
  }
  try {
    return await tool.run(user, args || {});
  } catch (err) {
    return { error: err.message };
  }
}

export { toolsForRole, runTool };