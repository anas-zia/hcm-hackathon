import AppError from '../utils/AppError.js';

// Usage: router.post('/', requireRole('HR'), handler)
export default (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(403, 'You do not have permission to do this'));
  }
  next();
};
