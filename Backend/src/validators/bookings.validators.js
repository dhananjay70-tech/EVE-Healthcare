const { z } = require('zod');

const createBookingSchema = z
  .object({
    testId: z.string().uuid('Invalid test id'),
    centreId: z.string().uuid('Invalid centre id'),
    // Coerced to a Date so both ISO strings and epoch millis are accepted;
    // an unparsable value fails validation here rather than reaching the DB.
    appointmentAt: z.coerce.date({ invalid_type_error: 'appointmentAt must be a valid date/time' }),
  })
  .refine((data) => data.appointmentAt.getTime() > Date.now(), {
    message: 'appointmentAt must be in the future',
    path: ['appointmentAt'],
  });

module.exports = { createBookingSchema };
