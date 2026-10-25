import AppError from './AppError.js';

function required(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new AppError(400, `Missing required field(s): ${missing.join(', ')}`);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
}

function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !isNaN(new Date(value + 'T00:00:00'));
}

export { required, isEmail, isDateString };
