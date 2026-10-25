import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import CompanySettings from '../models/CompanySettings.js';
import AppError from '../utils/AppError.js';
import { required, isEmail } from '../utils/validate.js';
import audit from '../utils/audit.js';

function makeTempPassword() {
  return crypto.randomBytes(6).toString('base64url'); // ~8 characters
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    employee: user.employee || null,
    mustChangePassword: user.mustChangePassword,
  };
}

function signToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

async function isSetupDone() {
  return (await User.countDocuments({ role: 'ADMIN' })) > 0;
}

// First run: company name + Admin account. Only works while no Admin exists.
async function firstRunSetup({ companyName, name, email, password }) {
  required({ companyName, name, email, password }, ['companyName', 'name', 'email', 'password']);
  if (await isSetupDone()) throw new AppError(409, 'Setup is already done');
  if (!isEmail(email)) throw new AppError(400, 'Invalid email address');
  if (password.length < 6) throw new AppError(400, 'Password must be at least 6 characters');

  await CompanySettings.deleteMany({});
  await CompanySettings.create({ companyName });
  const user = await User.create({
    name, email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10),
  });
  await audit(user, 'create', 'company', null, null, { companyName, admin: email });
  return { token: signToken(user), user: publicUser(user) };
}

// Optional: create the Admin from ADMIN_EMAIL / ADMIN_PASSWORD in .env on server start
async function seedAdminFromEnv() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || (await isSetupDone())) return;
  await CompanySettings.deleteMany({});
  await CompanySettings.create({ companyName: 'My Company' });
  await User.create({
    name: 'Admin', email: ADMIN_EMAIL, role: 'ADMIN', passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
  });
  console.log('Admin created from environment variables');
}

async function login(email, password) {
  required({ email, password }, ['email', 'password']);
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) throw new AppError(401, 'Wrong email or password');
  if (!user.active) throw new AppError(403, 'This account has been deactivated');
  return { token: signToken(user), user: publicUser(user) };
}

async function changePassword(user, currentPassword, newPassword) {
  required({ currentPassword, newPassword }, ['currentPassword', 'newPassword']);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'Current password is incorrect');
  }
  if (newPassword.length < 6) throw new AppError(400, 'New password must be at least 6 characters');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.mustChangePassword = false;
  await user.save();
  await audit(user, 'change_password', 'user', user._id);
  return publicUser(user);
}

// ADMIN creates an HR login
async function createHr(actor, { name, email }) {
  required({ name, email }, ['name', 'email']);
  if (!isEmail(email)) throw new AppError(400, 'Invalid email address');
  const temporaryPassword = makeTempPassword();
  const user = await User.create({
    name, email, role: 'HR', mustChangePassword: true,
    passwordHash: await bcrypt.hash(temporaryPassword, 10),
  });
  await audit(actor, 'create', 'user', user._id, null, { name, email, role: 'HR' });
  return { user: publicUser(user), temporaryPassword };
}

async function resetPassword(actor, userId) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.role === 'ADMIN') throw new AppError(403, 'Admin password cannot be reset here');
  const temporaryPassword = makeTempPassword();
  user.passwordHash = await bcrypt.hash(temporaryPassword, 10);
  user.mustChangePassword = true;
  await user.save();
  await audit(actor, 'reset_password', 'user', user._id);
  return { temporaryPassword };
}

async function setActive(actor, userId, active) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.role === 'ADMIN') throw new AppError(403, 'Admin cannot be deactivated');
  const before = { active: user.active };
  user.active = active;
  await user.save();
  await audit(actor, active ? 'activate' : 'deactivate', 'user', user._id, before, { active });
  return publicUser(user);
}

export {
  isSetupDone, firstRunSetup, seedAdminFromEnv, login, changePassword,
  createHr, resetPassword, setActive, publicUser, makeTempPassword,
};
