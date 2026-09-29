const AppError = require('../utils/AppError');

// Must run after `authenticate` (needs req.user.role). Kept as a separate,
// composable middleware rather than folded into `authenticate` so routes
// that only need "logged in" (not "logged in as admin") are unaffected.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(new AppError(403, 'Admin access required'));
  }
  next();
}

module.exports = requireAdmin;
