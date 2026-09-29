const { z } = require('zod');

const createCentreSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long'),
  location: z.string().trim().min(1, 'Location is required').max(255, 'Location is too long'),
});

const updateCentreSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long').optional(),
    location: z.string().trim().min(1, 'Location is required').max(255, 'Location is too long').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

module.exports = { createCentreSchema, updateCentreSchema };
