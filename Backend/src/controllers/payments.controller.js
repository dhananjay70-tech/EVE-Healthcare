const paymentsService = require('../services/payments.service');

async function create(req, res, next) {
  try {
    const { bookingId, outcome } = req.validatedBody;
    const result = await paymentsService.createPayment({ bookingId, userId: req.user.id, outcome });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function webhook(req, res, next) {
  try {
    const { bookingId, providerEventId, status } = req.validatedBody;
    const result = await paymentsService.handleWebhookEvent({ bookingId, providerEventId, status });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, webhook };
