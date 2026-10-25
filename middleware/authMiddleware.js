import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

// Paths a user may call even before they have changed their temporary password
const ALLOWED_BEFORE_PASSWORD_CHANGE = ['/api/auth/change-password', '/api/auth/me'];

// 1. read the JWT  2. load the user from the DB (so role/active are never trusted from the token)
export default asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Please log in');

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new AppError(401, 'Session expired, please log in again');
  }

  const user = await User.findById(payload.id);
  if (!user || !user.active) throw new AppError(401, 'This account is not active');

  if (user.mustChangePassword && !ALLOWED_BEFORE_PASSWORD_CHANGE.includes(req.originalUrl.split('?')[0])) {
    throw new AppError(403, 'You must change your temporary password first');
  }

  req.user = user;
  next();
});
