import Payroll from '../models/Payroll.js';
import Employee from '../models/Employee.js';
import Leave from '../models/Leave.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { getSettings } from './settingsService.js';
import { getDayStatuses } from './attendanceService.js';
import { notifyUser } from './notificationService.js';
import { monthRange, workingDaysBetween, eachDay, isWorkingDay } from '../utils/dateUtils.js';
import audit from '../utils/audit.js';

const round = (n) => Math.round(n);

// Tax slab on ANNUAL gross (gross x 12), from the brief (illustrative)
function annualTax(annualGross) {
  if (annualGross <= 600000) return 0;
  if (annualGross <= 1200000) return (annualGross - 600000) * 0.05;
  if (annualGross <= 2400000) return 30000 + (annualGross - 1200000) * 0.15;
  if (annualGross <= 3600000) return 210000 + (annualGross - 2400000) * 0.25;
  return 510000 + (annualGross - 3600000) * 0.35;
}

// Salary structure: Gross = 1.5 x basic (HRA 40% + medical 10%)
function salaryStructure(basic) {
  return { basic, hra: basic * 0.4, medical: basic * 0.1, gross: basic * 1.5 };
}

// Approved UNPAID leave days that fall inside the employee's payable window
async function unpaidDaysIn(employeeId, start, end, settings) {
  const leaves = await Leave.find({
    employee: employeeId, type: 'unpaid', status: 'approved',
    startDate: { $lte: end }, endDate: { $gte: start },
  }).lean();
  let total = 0;
  for (const l of leaves) {
    const from = l.startDate > start ? l.startDate : start;
    const to = l.endDate < end ? l.endDate : end;
    total += workingDaysBetween(from, to, settings).length;
  }
  return total;
}

async function buildItem(emp, month, settings) {
  const { start, end } = monthRange(month);
  const workingDays = workingDaysBetween(start, end, settings).length;

  // Joiners/leavers: only the days they were employed count
  const windowStart = emp.joinDate > start ? emp.joinDate : start;
  const windowEnd = emp.exitDate && emp.exitDate < end ? emp.exitDate : end;
  const payableDays = windowStart <= windowEnd ? workingDaysBetween(windowStart, windowEnd, settings).length : 0;

  const pay = salaryStructure(emp.basicSalary);
  const perDay = workingDays ? pay.gross / workingDays : 0;

  const statuses = await getDayStatuses([emp], windowStart, windowEnd);
  const absentDays = statuses.filter((s) => s.status === 'absent').length;
  const halfDays = statuses.filter((s) => s.status === 'half_day').length;
  const unpaidDays = await unpaidDaysIn(emp._id, windowStart, windowEnd, settings);

  const earned = perDay * payableDays;
  const deduction = perDay * (absentDays + unpaidDays + 0.5 * halfDays);
  const tax = workingDays ? (annualTax(pay.gross * 12) / 12) * (payableDays / workingDays) : 0;
  const net = Math.max(earned - deduction - tax, 0);

  return {
    employee: emp._id, employeeName: emp.name, employeeCode: emp.code,
    department: emp.department ? emp.department.name : '-',
    basic: round(pay.basic), hra: round(pay.hra), medical: round(pay.medical), gross: round(pay.gross),
    workingDays, payableDays, absentDays, unpaidDays, halfDays,
    deduction: round(deduction), tax: round(tax), net: round(net),
  };
}

// HR creates (or re-creates) the DRAFT for a month. Finalized months are locked.
async function runPayroll(user, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new AppError(400, 'Month must look like 2026-10');
  const existing = await Payroll.findOne({ month });
  if (existing && existing.status === 'finalized') throw new AppError(409, 'This month is finalized and locked');

  const settings = await getSettings();
  const { start, end } = monthRange(month);
  const employees = await Employee.find({ joinDate: { $lte: end } }).populate('department', 'name').lean();
  // skip people who left before this month started
  const inMonth = employees.filter((e) => !(e.exitDate && e.exitDate < start));
  if (!inMonth.length) throw new AppError(422, 'No employees to pay for this month');

  const items = [];
  for (const emp of inMonth) items.push(await buildItem(emp, month, settings));

  const data = {
    month, status: 'draft', items, createdBy: user._id,
    totalGross: items.reduce((s, i) => s + i.gross, 0),
    totalNet: items.reduce((s, i) => s + i.net, 0),
  };
  const before = existing ? existing.toObject() : null;
  const payroll = existing ? Object.assign(existing, data) : new Payroll(data);
  await payroll.save();
  await audit(user, existing ? 'update' : 'create', 'payroll', payroll._id, before && { status: before.status, totalNet: before.totalNet }, { month, status: 'draft', totalNet: data.totalNet });
  return payroll;
}

async function finalizePayroll(user, id) {
  const payroll = await Payroll.findById(id);
  if (!payroll) throw new AppError(404, 'Payroll run not found');
  if (payroll.status === 'finalized') throw new AppError(409, 'Already finalized');

  payroll.status = 'finalized';
  payroll.finalizedBy = user._id;
  payroll.finalizedAt = new Date();
  await payroll.save();

  // tell every employee their payslip is ready
  for (const item of payroll.items) {
    const empUser = await User.findOne({ employee: item.employee });
    if (empUser) await notifyUser(empUser._id, `Your payslip for ${payroll.month} is ready`);
  }
  await audit(user, 'finalize', 'payroll', payroll._id, { status: 'draft' }, { status: 'finalized', month: payroll.month });
  return payroll;
}

async function listRuns() {
  return Payroll.find().select('-items').sort({ month: -1 }).lean();
}

async function getRun(id) {
  const payroll = await Payroll.findById(id).lean();
  if (!payroll) throw new AppError(404, 'Payroll run not found');
  return payroll;
}

// Employee: only their OWN line, only from finalized runs
async function myPayslips(user) {
  const runs = await Payroll.find({ status: 'finalized', 'items.employee': user.employee }).sort({ month: -1 }).lean();
  return runs.map((run) => ({
    month: run.month,
    finalizedAt: run.finalizedAt,
    ...run.items.find((i) => String(i.employee) === String(user.employee)),
  }));
}

export { annualTax, salaryStructure, runPayroll, finalizePayroll, listRuns, getRun, myPayslips };
