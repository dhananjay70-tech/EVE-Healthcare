const { z } = require('zod');

const idParamSchema = z.object({
  id: z.string().uuid('Invalid id format'),
});

const paginationQuerySchema = z.object({
  // Capped well below Postgres's bigint range: an unbounded page, multiplied
  // by limit to compute OFFSET, can otherwise overflow and surface as an
  // unhandled 500 instead of a clean validation error.
  page: z.coerce
    .number()
    .int('page must be an integer')
    .positive('page must be at least 1')
    .max(1_000_000, 'page must be at most 1000000')
    .default(1),
  limit: z.coerce
    .number()
    .int('limit must be an integer')
    .positive('limit must be at least 1')
    .max(100, 'limit must be at most 100')
    .default(20),
});

module.exports = { idParamSchema, paginationQuerySchema };
