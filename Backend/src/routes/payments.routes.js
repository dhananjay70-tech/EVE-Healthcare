const express = require('express');
const paymentsController = require('../controllers/payments.controller');
const authenticate = require('../middleware/authenticate');
const validateRequest = require('../middleware/validateRequest');
const { createPaymentSchema, webhookEventSchema } = require('../validators/payments.validators');

const router = express.Router();

// Direct "pay for my own booking" call — requires the owning user's JWT.
router.post('/', authenticate, validateRequest({ body: createPaymentSchema }), paymentsController.create);

// Simulated inbound provider webhook — not authenticated with a user JWT
// (a real provider wouldn't have one); idempotency is what protects it.
router.post('/webhook', validateRequest({ body: webhookEventSchema }), paymentsController.webhook);

module.exports = router;
