const { z } = require('zod');

// Stored as a "350.00"-style string to match the numeric column and the
// existing seed-data convention (see src/db/seed.js).
const priceSchema = z.coerce
  .number({ invalid_type_error: 'price must be a number' })
  .positive('price must be greater than 0')
  .transform((n) => n.toFixed(2));

const createTestSchema = z.object({
  centreId: z.string().uuid('Invalid centre id'),
  name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long'),
  description: z.string().trim().max(2000, 'Description is too long').optional(),
  price: priceSchema,
});

// centreId is intentionally not updatable here — reassigning a test to a
// different centre after bookings reference it is a data-integrity hazard
// (see README "Limitations"), so a test's centre is fixed at creation time.
const updateTestSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long').optional(),
    description: z.string().trim().max(2000, 'Description is too long').optional(),
    price: priceSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

module.exports = { createTestSchema, updateTestSchema };
