const { uuid, varchar, timestamp } = require('drizzle-orm/pg-core');
const { eveHealthcareSchema } = require('./_schema');

// USER can browse/book; ADMIN can additionally manage centres and tests.
// New accounts always get USER (see auth.service.js) — there is no signup
// field for this, so a client can never self-elevate. Promoting an account
// to ADMIN is a manual DB step (see README).
const userRoleEnum = eveHealthcareSchema.enum('user_role', ['USER', 'ADMIN']);

const users = eveHealthcareSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull().default('USER'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

module.exports = { users, userRoleEnum };
