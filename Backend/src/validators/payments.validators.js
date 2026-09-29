const { z } = require('zod');

// No `amount` field on purpose — the payment amount always comes from the
// booking's stored amount, never from client input.
const createPaymentSchema = z.object({
  bookingId: z.string().uuid('Invalid booking id'),
  // Optional simulation hint (SUCCESS/FAILED). Omitted = randomly simulated,
  // like a real gateway. See README for why this exists.
  outcome: z.enum(['SUCCESS', 'FAILED']).optional(),
});

const webhookEventSchema = z.object({
  providerEventId: z.string().min(1, 'providerEventId is required').max(255),
  bookingId: z.string().uuid('Invalid booking id'),
  status: z.enum(['SUCCESS', 'FAILED']),
});

module.exports = { createPaymentSchema, webhookEventSchema };
