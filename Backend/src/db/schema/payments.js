const {
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  check,
} = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');
const { eveHealthcareSchema } = require('./_schema');
const { bookings } = require('./bookings');

const paymentStatusEnum = eveHealthcareSchema.enum('payment_status', ['PENDING', 'SUCCESS', 'FAILED']);

// Multiple payment attempts are allowed per booking (retries), but only one
// of them may ever be SUCCESS. That is enforced below with a partial unique
// index on booking_id, scoped to rows where status = 'SUCCESS' — PENDING and
// FAILED attempts never collide with it, so retries after a failure are free.
const payments = eveHealthcareSchema.table(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    providerEventId: varchar('provider_event_id', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('payments_booking_id_idx').on(table.bookingId),
    uniqueIndex('payments_provider_event_id_unique').on(table.providerEventId),
    uniqueIndex('payments_one_success_per_booking_idx')
      .on(table.bookingId)
      .where(sql`${table.status} = 'SUCCESS'`),
    check('payments_amount_positive', sql`${table.amount} > 0`),
  ],
);

module.exports = { payments, paymentStatusEnum };
