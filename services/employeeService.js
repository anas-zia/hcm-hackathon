import bcrypt from 'bcryptjs';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { required, isEmail, isDateString } from '../utils/validate.js';
import { makeTempPassword } from './authService.js';
import { getBalance } from './leaveService.js';
import { getDayStatuses } from './attendanceService.js';
import { todayStr, toDateStr } from '../utils/dateUtils.js';
import audit from '../utils/audit.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// HR registers an employee: creates the Employee AND their login (temporary password)
async function createEmployee(actor, body) {
  required(body, ['name', 'email', 'department', 'designation', 'joinDate', 'basicSalary']);
  if (!isEmail(body.email)) throw new AppError(400, 'Invalid email address');
  if (!isDateString(body.joinDate)) throw new AppError(400, 'Join date must be YYYY-MM-DD');
  if (!(Number(body.basicSalary) > 0)) throw new AppError(400, 'Salary must be greater than 0');
  if (!(await Department.findById(body.department))) throw new AppError(400, 'Unknown department');

  const count = await Employee.countDocuments();
  const code = body.code || `EMP-${String(count + 1).padStart(4, '0')}`;
  if (await Employee.findOne({ $or: [{ code }, { email: body.email.toLowerCase() }] })) {
    throw new AppError(409, 'Employee code or email already exists');
  }
  if (await User.findOne({ email: body.email.toLowerCase() })) throw new AppError(409, 'This email already has a login');

  const employee = await Employee.create({
    code, name: body.name, email: body.email, phone: body.phone, address: body.address,
    gender: body.gender || 'other', department: body.department, designation: body.designation,
    joinDate: body.joinDate, status: body.status || 'active', basicSalary: Number(body.basicSalary),
  });

  const temporaryPassword = makeTempPassword();
  try {
    const user = await User.create({
      name: employee.name, email: employee.email, role: 'EMPLOYEE', employee: employee._id,
      mustChangePassword: true, passwordHash: await bcrypt.hash(temporaryPassword, 10),
    });
    employee.user = user._id;
    await employee.save();
  } catch (err) {
    await Employee.findByIdAndDelete(employee._id); // do not leave an employee without a login
    throw err;
  }

  await audit(actor, 'create', 'employee', employee._id, null, employee.toObject());
  return { employee, temporaryPassword };
}

async function listEmployees(user, { q, department, status, page = 1, limit = 20 }) {
  const filter = {};
  if (user.role === 'EMPLOYEE') filter._id = user.employee; // data scope: only own row
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { code: rx }];
  }
  if (department) filter.department = department;
  if (status) filter.status = status;

  const pageNum = Math.max(Number(page) || 1, 1);
  const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const [items, total] = await Promise.all([
    Employee.find(filter).populate('department', 'name').sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum).limit(limitNum).lean(),
    Employee.countDocuments(filter),
  ]);
  return { items, total, page: pageNum, pages: Math.ceil(total / limitNum) };
}

function assertCanSee(user, employeeId) {
  if (user.role === 'EMPLOYEE' && String(user.employee) !== String(employeeId)) {
    throw new AppError(403, 'You can only see your own data');
  }
}

// Employee 360: profile + last 30 days attendance summary + leave balance
async function getEmployee360(user, id) {
  assertCanSee(user, id);
  const employee = await Employee.findById(id).populate('department', 'name').lean();
  if (!employee) throw new AppError(404, 'Employee not found');

  const from = toDateStr(new Date(Date.now() - 29 * 24 * 3600 * 1000));
  const days = await getDayStatuses([employee], from, todayStr());
  const attendance = {};
  days.forEach((d) => { attendance[d.status] = (attendance[d.status] || 0) + 1; });

  return { employee, attendanceLast30Days: attendance, leaveBalance: await getBalance(id) };
}

async function updateEmployee(user, id, body) {
  assertCanSee(user, id);
  const employee = await Employee.findById(id);
  if (!employee) throw new AppError(404, 'Employee not found');
  const before = employee.toObject();

  // Employee: phone + address only. HR: everything below.
  const allowed = user.role === 'EMPLOYEE'
    ? ['phone', 'address']
    : ['name', 'phone', 'address', 'gender', 'department', 'designation', 'basicSalary', 'status', 'exitDate'];

  for (const field of allowed) {
    if (body[field] !== undefined) employee[field] = body[field];
  }
  if (employee.basicSalary <= 0) throw new AppError(400, 'Salary must be greater than 0');
  if (employee.status === 'exited') {
    employee.exitDate = employee.exitDate || todayStr();
    await User.findByIdAndUpdate(employee.user, { active: false }); // exited employees cannot log in
  }
  await employee.save();
  await audit(user, 'update', 'employee', employee._id, before, employee.toObject());
  return employee;
}

export { createEmployee, listEmployees, getEmployee360, updateEmployee, assertCanSee };
