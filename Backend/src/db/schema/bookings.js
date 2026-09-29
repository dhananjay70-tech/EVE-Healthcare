const { uuid, timestamp, numeric, index, check, foreignKey } = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');
const { eveHealthcareSchema } = require('./_schema');
const { users } = require('./users');
const { tests } = require('./tests');
const { centres } = require('./centres');

const bookingStatusEnum = eveHealthcareSchema.enum('booking_status', [
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
]);

const bookings = eveHealthcareSchema.table(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    testId: uuid('test_id')
      .notNull()
      .references(() => tests.id, { onDelete: 'restrict' }),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id, { onDelete: 'restrict' }),
    appointmentAt: timestamp('appointment_at', { withTimezone: true }).notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    status: bookingStatusEnum('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bookings_user_id_idx').on(table.userId),
    index('bookings_test_id_idx').on(table.testId),
    index('bookings_centre_id_idx').on(table.centreId),
    check('bookings_amount_positive', sql`${table.amount} > 0`),
    // Composite FK against tests(id, centre_id): the database itself
    // rejects a booking whose test_id/centre_id pair doesn't match a real
    // test actually offered by that centre, regardless of application code.
    foreignKey({
      name: 'bookings_test_belongs_to_centre_fk',
      columns: [table.testId, table.centreId],
      foreignColumns: [tests.id, tests.centreId],
    }).onDelete('restrict'),
  ],
);

module.exports = { bookings, bookingStatusEnum };
