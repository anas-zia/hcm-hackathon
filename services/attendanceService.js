import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';
import AppError from '../utils/AppError.js';
import { getSettings } from './settingsService.js';
import { todayStr, eachDay, isWorkingDay, hoursBetween, monthRange } from '../utils/dateUtils.js';

// Late = after office start + grace (09:00 + 15 min = 09:15)
function isLate(now, settings) {
  const [h, m] = settings.officeStart.split(':').map(Number);
  const limit = new Date(now);
  limit.setHours(h, m + settings.graceMinutes, 0, 0);
  return now > limit;
}

async function getEmployeeId(user) {
  if (!user.employee) throw new AppError(403, 'Only employees can check in or out');
  return user.employee;
}

async function checkIn(user) {
  const employee = await getEmployeeId(user);
  const settings = await getSettings();
  const now = new Date(); // server stamps the time, never the browser
  const date = todayStr();

  if (await Attendance.findOne({ employee, date })) {
    throw new AppError(409, 'You have already checked in today');
  }
  const record = await Attendance.create({
    employee, date, checkIn: now, status: isLate(now, settings) ? 'late' : 'present', source: 'web',
  });
  return record;
}

async function checkOut(user) {
  const employee = await getEmployeeId(user);
  const settings = await getSettings();
  const record = await Attendance.findOne({ employee, date: todayStr() });
  if (!record) throw new AppError(409, 'You have not checked in today');
  if (record.checkOut) throw new AppError(409, 'You have already checked out today');

  record.checkOut = new Date();
  // Half day: worked less than 5 hours
  if (hoursBetween(record.checkIn, record.checkOut) < settings.halfDayHours) record.status = 'half_day';
  await record.save();
  return record;
}

// Status we show: a past day with no check-out becomes "missing_checkout"
function effectiveStatus(record, today) {
  if (!record.checkOut && record.date < today) return 'missing_checkout';
  return record.status;
}

/**
 * The one function that decides each employee's status for each working day.
 * Payroll, dashboards, board and AI all use it, so their numbers always match.
 * Statuses: present, late, half_day, missing_checkout, absent, on_leave
 * (today without a record is skipped: the day is not over yet)
 */
async function getDayStatuses(employees, from, to) {
  const settings = await getSettings();
  const today = todayStr();
  const ids = employees.map((e) => e._id);

  const [records, leaves] = await Promise.all([
    Attendance.find({ employee: { $in: ids }, date: { $gte: from, $lte: to } }).lean(),
    Leave.find({ employee: { $in: ids }, status: 'approved', startDate: { $lte: to }, endDate: { $gte: from } }).lean(),
  ]);

  const recordMap = new Map(records.map((r) => [`${r.employee}_${r.date}`, r]));
  const result = [];
  const last = to < today ? to : today;
  if (from > last) return result;

  for (const emp of employees) {
    const empLeaves = leaves.filter((l) => String(l.employee) === String(emp._id));
    for (const date of eachDay(from, last)) {
      if (!isWorkingDay(date, settings)) continue;
      if (date < emp.joinDate || (emp.exitDate && date > emp.exitDate)) continue;

      const record = recordMap.get(`${emp._id}_${date}`);
      const onLeave = empLeaves.some((l) => l.startDate <= date && l.endDate >= date);
      let status;
      if (record) status = effectiveStatus(record, today);
      else if (onLeave) status = 'on_leave';
      else if (date < today) status = 'absent';
      else continue;
      result.push({ employee: String(emp._id), date, status });
    }
  }
  return result;
}

// Employee's own calendar for a month ("YYYY-MM")
async function getMyMonth(user, month) {
  const employee = await Employee.findById(await getEmployeeId(user)).lean();
  const { start: from, end: to } = monthRange(month);
  const records = await Attendance.find({ employee: employee._id, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean();
  const statuses = await getDayStatuses([employee], from, to);
  const today = todayStr();
  return {
    today: records.find((r) => r.date === today) || null,
    records: records.map((r) => ({ ...r, status: effectiveStatus(r, today) })),
    days: statuses, // includes absent / on_leave days that have no record
  };
}

// HR / Admin daily board: every active employee with today's (or any day's) status
async function getDailyBoard(date, departmentId) {
  const filter = { status: { $ne: 'exited' }, joinDate: { $lte: date } };
  if (departmentId) filter.department = departmentId;
  const employees = await Employee.find(filter).populate('department', 'name').lean();
  const records = await Attendance.find({ date, employee: { $in: employees.map((e) => e._id) } }).lean();
  const statuses = await getDayStatuses(employees, date, date);
  const today = todayStr();

  return employees.map((emp) => {
    const record = records.find((r) => String(r.employee) === String(emp._id));
    const found = statuses.find((s) => s.employee === String(emp._id));
    return {
      employeeId: emp._id,
      code: emp.code,
      name: emp.name,
      department: emp.department ? emp.department.name : '-',
      checkIn: record ? record.checkIn : null,
      checkOut: record ? record.checkOut : null,
      status: found ? found.status : (date === today ? 'not_checked_in' : 'non_working_day'),
    };
  });
}

export { checkIn, checkOut, getDayStatuses, getMyMonth, getDailyBoard };
