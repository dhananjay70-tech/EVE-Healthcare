const { z } = require('zod');

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  // bcrypt only considers the first 72 bytes of a password, so cap input there.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(72, 'Password must be at most 72 characters long'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

module.exports = { signupSchema, loginSchema };
