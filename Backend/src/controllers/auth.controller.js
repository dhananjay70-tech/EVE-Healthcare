const authService = require('../services/auth.service');

async function signup(req, res, next) {
  try {
    const user = await authService.signup(req.validatedBody);
    res.status(201).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { token, user } = await authService.login(req.validatedBody);
    res.status(200).json({ success: true, data: { token, user } });
  } catch (err) {
    next(err);
  }
}

function me(req, res) {
  res.status(200).json({ success: true, data: { user: req.user } });
}

module.exports = { signup, login, me };
