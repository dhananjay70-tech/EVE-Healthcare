const { uuid, varchar, text, numeric, timestamp, index, check, unique } = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');
const { eveHealthcareSchema } = require('./_schema');
const { centres } = require('./centres');

const tests = eveHealthcareSchema.table(
  'tests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tests_centre_id_idx').on(table.centreId),
    check('tests_price_positive', sql`${table.price} > 0`),
    // Lets bookings enforce "this test belongs to this centre" via a
    // composite foreign key instead of only relying on application code.
    unique('tests_id_centre_id_unique').on(table.id, table.centreId),
  ],
);

module.exports = { tests };
