// These tests inspect the Drizzle table definitions themselves (no live
// PostgreSQL connection needed) to lock in the assignment's schema
// requirements and catch accidental regressions if the schema files change.
const { getTableConfig } = require('drizzle-orm/pg-core');
const { users } = require('../src/db/schema/users');
const { tests } = require('../src/db/schema/tests');
const { bookings, bookingStatusEnum } = require('../src/db/schema/bookings');
const { payments, paymentStatusEnum } = require('../src/db/schema/payments');

describe('users schema', () => {
  it('has a unique email column and only a password_hash column (no plaintext password)', () => {
    const { columns } = getTableConfig(users);
    const email = columns.find((c) => c.name === 'email');
    const passwordColumnNames = columns.map((c) => c.name).filter((name) => name.includes('password'));

    expect(email.isUnique).toBe(true);
    expect(passwordColumnNames).toEqual(['password_hash']);
  });
});

describe('bookings schema', () => {
  it('has foreign keys to users, tests, and centres', () => {
    const { foreignKeys } = getTableConfig(bookings);
    const simpleRefs = foreignKeys
      .map((fk) => fk.reference())
      .filter((ref) => ref.columns.length === 1)
      .map((ref) => ({
        column: ref.columns[0].name,
        foreignTable: ref.foreignTable[Symbol.for('drizzle:Name')],
        foreignColumn: ref.foreignColumns[0].name,
      }));

    expect(simpleRefs).toEqual(
      expect.arrayContaining([
        { column: 'user_id', foreignTable: 'users', foreignColumn: 'id' },
        { column: 'test_id', foreignTable: 'tests', foreignColumn: 'id' },
        { column: 'centre_id', foreignTable: 'centres', foreignColumn: 'id' },
      ]),
    );
  });

  it('enforces that the booked test actually belongs to the booked centre via a composite foreign key', () => {
    const { foreignKeys } = getTableConfig(bookings);
    const compositeFk = foreignKeys
      .map((fk) => fk.reference())
      .find((ref) => ref.columns.length === 2);

    expect(compositeFk).toBeDefined();
    expect(compositeFk.columns.map((c) => c.name).sort()).toEqual(['centre_id', 'test_id']);
    expect(compositeFk.foreignTable[Symbol.for('drizzle:Name')]).toBe('tests');
    expect(compositeFk.foreignColumns.map((c) => c.name).sort()).toEqual(['centre_id', 'id']);
  });

  it('supports the PENDING, CONFIRMED, FAILED, CANCELLED statuses', () => {
    expect(bookingStatusEnum.enumValues).toEqual(['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED']);
  });
});

describe('tests schema', () => {
  it('has a unique (id, centre_id) constraint so bookings can reference it', () => {
    const { uniqueConstraints } = getTableConfig(tests);
    const constraint = uniqueConstraints.find((u) => u.name === 'tests_id_centre_id_unique');

    expect(constraint).toBeDefined();
    expect(constraint.columns.map((c) => c.name).sort()).toEqual(['centre_id', 'id']);
  });
});

describe('payments schema', () => {
  it('supports the PENDING, SUCCESS, FAILED statuses', () => {
    expect(paymentStatusEnum.enumValues).toEqual(['PENDING', 'SUCCESS', 'FAILED']);
  });

  it('allows multiple payment attempts per booking but only one SUCCESS', () => {
    const { indexes } = getTableConfig(payments);

    const bookingIdIndex = indexes.find((i) => i.config.name === 'payments_booking_id_idx');
    const oneSuccessIndex = indexes.find((i) => i.config.name === 'payments_one_success_per_booking_idx');

    // A plain (non-unique) index on booking_id — multiple rows per booking are fine.
    expect(bookingIdIndex.config.unique).toBe(false);
    // A unique index scoped to booking_id, but only WHERE status = 'SUCCESS'.
    expect(oneSuccessIndex.config.unique).toBe(true);
    expect(oneSuccessIndex.config.columns.map((c) => c.name)).toEqual(['booking_id']);
    expect(oneSuccessIndex.config.where).toBeDefined();
  });

  it('makes provider_event_id unique when present (nullable initially)', () => {
    const { columns, indexes } = getTableConfig(payments);
    const providerEventId = columns.find((c) => c.name === 'provider_event_id');
    const uniqueIndex = indexes.find((i) => i.config.name === 'payments_provider_event_id_unique');

    expect(providerEventId.notNull).toBe(false);
    expect(uniqueIndex.config.unique).toBe(true);
    expect(uniqueIndex.config.columns.map((c) => c.name)).toEqual(['provider_event_id']);
  });
});
