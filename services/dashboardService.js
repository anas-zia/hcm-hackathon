import Employee from '../models/Employee.js';
import Leave from '../models/Leave.js';
import Payroll from '../models/Payroll.js';
import Announcement from '../models/Announcement.js';
import AuditLog from '../models/AuditLog.js';
import Attendance from '../models/Attendance.js';
import { getSettings } from './settingsService.js';
import { getDayStatuses } from './attendanceService.js';
import { getBalance } from './leaveService.js';
import { todayStr, toDateStr, eachDay, hoursBetween } from '../utils/dateUtils.js';

const count = (list, status) => list.filter((s) => s.status === status).length;

// Filters come from the query string: ?from=&to=&department=
function resolveFilters(query) {
  const today = todayStr();
  const monthStart = today.slice(0, 8) + '01';
  return { from: query.from || monthStart, to: query.to || today, department: query.department || null };
}

async function activeEmployees(department) {
  const filter = { status: { $ne: 'exited' } };
  if (department) filter.department = department;
  return Employee.find(filter).populate('department', 'name').lean();
}

// Attendance rate = (present + late + missing_checkout + 0.5 x half_day) / (records - on_leave)
function attendanceRate(statuses) {
  const good = count(statuses, 'present') + count(statuses, 'late') + count(statuses, 'missing_checkout') + 0.5 * count(statuses, 'half_day');
  const total = statuses.length - count(statuses, 'on_leave');
  return total > 0 ? Math.round((good / total) * 1000) / 10 : 0;
}

// Shared KPI block used by the HR dashboard, Admin dashboard and the AI tools
async function companyKpis(query) {
  const { from, to, department } = resolveFilters(query);
  const today = todayStr();
  const employees = await activeEmployees(department);
  const ids = employees.map((e) => String(e._id));

  const statuses = await getDayStatuses(employees, from, to);
  const todayRecords = await Attendance.find({ date: today, employee: { $in: ids } }).lean();
  const onLeaveToday = await Leave.find({
    employee: { $in: ids }, status: 'approved', startDate: { $lte: today }, endDate: { $gte: today },
  }).lean();
  const pending = await Leave.countDocuments({ employee: { $in: ids }, status: 'pending' });

  // trend: attendance rate per day
  const trend = eachDay(from, to).map((date) => {
    const day = statuses.filter((s) => s.date === date);
    return { date, rate: day.length ? attendanceRate(day) : null, present: count(day, 'present') + count(day, 'late') };
  }).filter((d) => d.rate !== null);

  // absenteeism by department = absent days / expected working days
  const byDept = {};
  employees.forEach((e) => {
    const name = e.department ? e.department.name : '-';
    byDept[name] = byDept[name] || { department: name, headcount: 0, absent: 0, expected: 0, late: 0, worked: 0 };
    byDept[name].headcount += 1;
  });
  statuses.forEach((s) => {
    const emp = employees.find((e) => String(e._id) === s.employee);
    const row = byDept[emp.department ? emp.department.name : '-'];
    row.expected += 1;
    if (s.status === 'absent') row.absent += 1;
    if (s.status === 'late') row.late += 1;
    if (s.status === 'present' || s.status === 'late') row.worked += 1;
  });
  const deptStats = Object.values(byDept).map((d) => ({
    department: d.department,
    headcount: d.headcount,
    absenteeismPct: d.expected ? Math.round((d.absent / d.expected) * 1000) / 10 : 0,
    latePct: d.worked ? Math.round((d.late / d.worked) * 1000) / 10 : 0,
  }));

  // top 5 late-comers
  const lateCounts = {};
  statuses.filter((s) => s.status === 'late').forEach((s) => { lateCounts[s.employee] = (lateCounts[s.employee] || 0) + 1; });
  const topLate = Object.entries(lateCounts)
    .map(([id, lates]) => ({ name: employees.find((e) => String(e._id) === id).name, lates }))
    .sort((a, b) => b.lates - a.lates).slice(0, 5);

  // leave by type (approved days in range)
  const leaves = await Leave.find({
    employee: { $in: ids }, status: 'approved', startDate: { $lte: to }, endDate: { $gte: from },
  }).lean();
  const leaveByType = { annual: 0, sick: 0, casual: 0, unpaid: 0 };
  leaves.forEach((l) => { leaveByType[l.type] += l.days; });

  return {
    filters: { from, to, department },
    headcount: employees.length,
    presentToday: todayRecords.length,
    onLeaveToday: onLeaveToday.length,
    lateToday: todayRecords.filter((r) => r.status === 'late').length,
    pendingApprovals: pending,
    attendanceRate: attendanceRate(statuses),
    trend,
    departments: deptStats,
    leaveByType,
    topLateComers: topLate,
  };
}

async function announcements() {
  return Announcement.find().sort({ createdAt: -1 }).limit(5).lean();
}

async function hrDashboard(query) {
  return { ...(await companyKpis(query)), announcements: await announcements() };
}

async function adminDashboard(query) {
  const kpis = await companyKpis(query);
  const { department } = resolveFilters(query);
  const year = new Date().getFullYear();

  // attrition YTD = exits this year / average headcount x 100
  const exits = await Employee.countDocuments({ exitDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } });
  const headcountAtYearStart = await Employee.countDocuments({
    joinDate: { $lt: `${year}-01-01` }, $or: [{ exitDate: null }, { exitDate: { $gte: `${year}-01-01` } }],
  });
  const avgHeadcount = (headcountAtYearStart + kpis.headcount) / 2;
  const attritionYtd = avgHeadcount ? Math.round((exits / avgHeadcount) * 1000) / 10 : 0;

  // payroll cost by month (finalized runs only) + by department (latest run)
  const runs = await Payroll.find({ status: 'finalized' }).sort({ month: 1 }).lean();
  const payrollByMonth = runs.map((r) => ({ month: r.month, gross: r.totalGross, net: r.totalNet }));
  const payrollByDept = {};
  const latest = runs[runs.length - 1];
  if (latest) {
    latest.items.forEach((i) => { payrollByDept[i.department] = (payrollByDept[i.department] || 0) + i.gross; });
  }

  const employees = await activeEmployees(department);
  const avgGross = employees.length
    ? Math.round(employees.reduce((s, e) => s + e.basicSalary * 1.5, 0) / employees.length) : 0;

  // gender + tenure (years)
  const gender = { male: 0, female: 0, other: 0 };
  const tenure = { 'under 1 year': 0, '1-3 years': 0, 'over 3 years': 0 };
  const today = new Date();
  employees.forEach((e) => {
    gender[e.gender] += 1;
    const years = (today - new Date(e.joinDate + 'T00:00:00')) / (365.25 * 24 * 3600 * 1000);
    if (years < 1) tenure['under 1 year'] += 1;
    else if (years <= 3) tenure['1-3 years'] += 1;
    else tenure['over 3 years'] += 1;
  });

  const lastPayroll = latest ? latest.totalGross : 0;
  const audit = await AuditLog.find().sort({ createdAt: -1 }).limit(8).lean();

  return {
    ...kpis,
    attritionYtd,
    payrollCostLastRun: lastPayroll,
    averageSalary: avgGross,
    payrollByMonth,
    payrollByDept: Object.entries(payrollByDept).map(([department, gross]) => ({ department, gross })),
    gender,
    tenure,
    auditFeed: audit,
    announcements: await announcements(),
  };
}

async function employeeDashboard(user) {
  const emp = await Employee.findById(user.employee).lean();
  const today = todayStr();
  const weekStart = toDateStr(new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 24 * 3600 * 1000)); // Monday

  const week = await Attendance.find({ employee: emp._id, date: { $gte: weekStart, $lte: today } }).lean();
  const hoursThisWeek = week.reduce((s, r) => s + (r.checkOut ? hoursBetween(r.checkIn, r.checkOut) : 0), 0);

  const monthStart = today.slice(0, 8) + '01';
  const statuses = await getDayStatuses([emp], monthStart, today);
  const settings = await getSettings();
  const lastRun = await Payroll.findOne({ status: 'finalized', 'items.employee': emp._id }).sort({ month: -1 }).lean();
  const lastPayslip = lastRun ? lastRun.items.find((i) => String(i.employee) === String(emp._id)) : null;

  return {
    name: emp.name,
    hoursThisWeek: Math.round(hoursThisWeek * 10) / 10,
    targetHours: 40,
    lateCountThisMonth: count(statuses, 'late'),
    leaveBalance: await getBalance(emp._id),
    lastPayslip: lastPayslip ? { month: lastRun.month, net: lastPayslip.net } : null,
    announcements: await announcements(),
    officeStart: settings.officeStart,
  };
}

export { companyKpis, hrDashboard, adminDashboard, employeeDashboard, resolveFilters };
