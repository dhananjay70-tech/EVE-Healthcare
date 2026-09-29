const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { findUserById } = require('../services/auth.service');

// Reusable JWT auth guard: verifies the Bearer token, looks up the current
// user by the id embedded in it, and attaches a safe identity to req.user.
// Only the token's subject is trusted here — request bodies are never used
// to determine who is making the request.
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, 'Missing or malformed authorization token');
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      throw new AppError(401, 'Invalid or expired token');
    }

    const user = await findUserById(payload.sub);

    if (!user) {
      throw new AppError(401, 'Invalid or expired token');
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authenticate;
