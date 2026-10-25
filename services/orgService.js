import AppError from '../utils/AppError.js';
import Department from '../models/Department.js';
import User from '../models/User.js';
import { getSettings } from './settingsService.js';
import { required, isDateString } from '../utils/validate.js';
import audit from '../utils/audit.js';

const EDITABLE = ['companyName', 'officeStart', 'graceMinutes', 'halfDayHours', 'weekendDays',
  'officeLat', 'officeLng', 'officeRadius', 'leaveQuotas', 'designations', 'holidays'];

// Admin only. New settings apply to new records only (old records keep their stored status).
async function updateSettings(user, body) {
  const settings = await getSettings();
  const before = settings.toObject();
  if (body.officeStart && !/^\d{2}:\d{2}$/.test(body.officeStart)) throw new AppError(400, 'Office start must be HH:mm');
  (body.holidays || []).forEach((h) => {
    if (!isDateString(h.date) || !h.name) throw new AppError(400, 'Each holiday needs a date (YYYY-MM-DD) and a name');
  });
  EDITABLE.forEach((f) => { if (body[f] !== undefined) settings[f] = body[f]; });
  await settings.save();
  await audit(user, 'update', 'settings', settings._id, before, settings.toObject());
  return settings;
}

async function listDepartments() {
  return Department.find().sort({ name: 1 });
}

async function createDepartment(user, body) {
  required(body, ['name']);
  const dept = await Department.create({ name: body.name });
  await audit(user, 'create', 'department', dept._id, null, { name: dept.name });
  return dept;
}

async function listUsers() {
  return User.find().select('-passwordHash').sort({ createdAt: -1 });
}

export { updateSettings, listDepartments, createDepartment, listUsers };
