import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { required, isDateString } from '../utils/validate.js';
import { getSettings } from './settingsService.js';
import { notifyUser, notifyRole } from './notificationService.js';
import { workingDaysBetween, todayStr } from '../utils/dateUtils.js';
import audit from '../utils/audit.js';

const LEAVE_TYPES = ['annual', 'sick', 'casual', 'unpaid'];

// Quota, approved, pending and remaining for every leave type in one year
async function getBalance(employeeId, year = new Date().getFullYear()) {
  const settings = await getSettings();
  const leaves = await Leave.find({
    employee: employeeId,
    status: { $in: ['approved', 'pending'] },
    startDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
  }).lean();

  const balance = {};
  for (const type of LEAVE_TYPES) {
    const used = leaves.filter((l) => l.type === type && l.status === 'approved').reduce((s, l) => s + l.days, 0);
    const pending = leaves.filter((l) => l.type === type && l.status === 'pending').reduce((s, l) => s + l.days, 0);
    const quota = type === 'unpaid' ? null : settings.leaveQuotas[type]; // unpaid = unlimited
    balance[type] = { quota, used, pending, remaining: quota === null ? null : quota - used - pending };
  }
  return balance;
}

async function applyLeave(user, { type, startDate, endDate, reason }) {
  if (!user.employee) throw new AppError(403, 'Only employees can apply for leave');
  required({ type, startDate, endDate }, ['type', 'startDate', 'endDate']);
  if (!LEAVE_TYPES.includes(type)) throw new AppError(400, 'Unknown leave type');
  if (!isDateString(startDate) || !isDateString(endDate)) throw new AppError(400, 'Dates must be YYYY-MM-DD');
  if (endDate < startDate) throw new AppError(400, 'End date cannot be before start date');
  if (startDate < todayStr()) throw new AppError(400, 'Leave cannot start in the past');

  const settings = await getSettings();
  const days = workingDaysBetween(startDate, endDate, settings).length; // skips weekends + holidays
  if (days === 0) throw new AppError(422, 'These dates have no working days (weekend or holiday)');

  // Overlap with an existing pending/approved leave = 422
  const overlap = await Leave.findOne({
    employee: user.employee,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });
  if (overlap) throw new AppError(422, `Overlaps with your ${overlap.status} leave (${overlap.startDate} to ${overlap.endDate})`);

  // Over balance = 422
  const balance = await getBalance(user.employee, Number(startDate.slice(0, 4)));
  const remaining = balance[type].remaining;
  if (remaining !== null && days > remaining) {
    throw new AppError(422, `Not enough ${type} leave: ${remaining} day(s) left, you asked for ${days}`);
  }

  const leave = await Leave.create({ employee: user.employee, type, startDate, endDate, days, reason });
  const emp = await Employee.findById(user.employee);
  await notifyRole('HR', `${emp.name} requested ${days} day(s) of ${type} leave (${startDate} to ${endDate})`);
  await audit(user, 'create', 'leave', leave._id, null, leave.toObject());
  return leave;
}

async function listLeaves(user, { status, employeeId } = {}) {
  const filter = {};
  if (user.role === 'EMPLOYEE') filter.employee = user.employee; // data scope
  else if (employeeId) filter.employee = employeeId;
  if (status) filter.status = status;
  return Leave.find(filter).populate('employee', 'name code').sort({ createdAt: -1 }).lean();
}

async function decideLeave(user, leaveId, decision, comment) {
  const leave = await Leave.findById(leaveId);
  if (!leave) throw new AppError(404, 'Leave request not found');
  if (leave.status !== 'pending') throw new AppError(409, `This request is already ${leave.status}`);
  if (decision === 'rejected' && !comment) throw new AppError(400, 'Please add a comment when rejecting');

  const before = leave.toObject();
  leave.status = decision;
  leave.comment = comment || '';
  leave.decidedBy = user._id;
  await leave.save();

  const empUser = await User.findOne({ employee: leave.employee });
  if (empUser) {
    await notifyUser(empUser._id, `Your ${leave.type} leave (${leave.startDate} to ${leave.endDate}) was ${decision}${comment ? ': ' + comment : ''}`);
  }
  await audit(user, decision === 'approved' ? 'approve' : 'reject', 'leave', leave._id, before, leave.toObject());
  return leave;
}

async function cancelLeave(user, leaveId) {
  const leave = await Leave.findById(leaveId);
  if (!leave || String(leave.employee) !== String(user.employee)) throw new AppError(404, 'Leave request not found');
  if (!['pending', 'approved'].includes(leave.status)) throw new AppError(409, `This request is already ${leave.status}`);
  if (leave.startDate < todayStr()) throw new AppError(422, 'Leave that has already started cannot be cancelled');

  const before = leave.toObject();
  leave.status = 'cancelled';
  await leave.save();
  await audit(user, 'cancel', 'leave', leave._id, before, leave.toObject());
  return leave;
}

export { LEAVE_TYPES, getBalance, applyLeave, listLeaves, decideLeave, cancelLeave };
