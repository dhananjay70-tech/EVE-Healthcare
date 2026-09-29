const { uuid, varchar, timestamp } = require('drizzle-orm/pg-core');
const { eveHealthcareSchema } = require('./_schema');

const centres = eveHealthcareSchema.table('centres', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  location: varchar('location', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

module.exports = { centres };
