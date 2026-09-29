const { eq, desc, count } = require('drizzle-orm');
const { db } = require('../db');
const { bookings } = require('../db/schema/bookings');
const { tests } = require('../db/schema/tests');
const { centres } = require('../db/schema/centres');
const AppError = require('../utils/AppError');

function buildPagination({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

const bookingWithDetailsShape = {
  id: bookings.id,
  userId: bookings.userId,
  appointmentAt: bookings.appointmentAt,
  amount: bookings.amount,
  status: bookings.status,
  createdAt: bookings.createdAt,
  updatedAt: bookings.updatedAt,
  test: { id: tests.id, name: tests.name, price: tests.price },
  centre: { id: centres.id, name: centres.name, location: centres.location },
};

// Creates a booking with the amount computed server-side from the test's
// stored price (never from client input), after confirming the selected
// test actually belongs to the selected centre. Wrapped in a transaction so
// the existence/ownership checks and the insert happen against one
// consistent snapshot.
async function createBooking({ userId, testId, centreId, appointmentAt }) {
  return db.transaction(async (tx) => {
    const [centre] = await tx.select().from(centres).where(eq(centres.id, centreId)).limit(1);

    if (!centre) {
      throw new AppError(404, 'Centre not found');
    }

    const [test] = await tx.select().from(tests).where(eq(tests.id, testId)).limit(1);

    if (!test) {
      throw new AppError(404, 'Test not found');
    }

    if (test.centreId !== centreId) {
      throw new AppError(400, 'The selected test does not belong to the selected centre');
    }

    const [booking] = await tx
      .insert(bookings)
      .values({
        userId,
        testId,
        centreId,
        appointmentAt,
        amount: test.price,
        status: 'PENDING',
      })
      .returning();

    return booking;
  });
}

async function listBookingsForUser(userId, { page, limit }) {
  const offset = (page - 1) * limit;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select(bookingWithDetailsShape)
      .from(bookings)
      .innerJoin(tests, eq(bookings.testId, tests.id))
      .innerJoin(centres, eq(bookings.centreId, centres.id))
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(bookings).where(eq(bookings.userId, userId)),
  ]);

  return { bookings: rows, pagination: buildPagination({ page, limit, total }) };
}

// Returns the same 404 whether the booking doesn't exist or simply isn't
// owned by this user, so a request never reveals that someone else's
// booking id is valid.
async function getBookingById(id, userId) {
  const [booking] = await db
    .select(bookingWithDetailsShape)
    .from(bookings)
    .innerJoin(tests, eq(bookings.testId, tests.id))
    .innerJoin(centres, eq(bookings.centreId, centres.id))
    .where(eq(bookings.id, id))
    .limit(1);

  if (!booking || booking.userId !== userId) {
    throw new AppError(404, 'Booking not found');
  }

  return booking;
}

// Locks the booking row for the duration of the transaction so a
// concurrent payment attempt (which also locks this row — see
// payments.service.js) can't race with a cancellation: whichever
// transaction gets the lock first is the one that determines the final
// status, and the other sees the up-to-date row once it proceeds.
async function cancelBooking(id, userId) {
  return db.transaction(async (tx) => {
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, id)).limit(1).for('update');

    if (!booking || booking.userId !== userId) {
      throw new AppError(404, 'Booking not found');
    }

    if (booking.status === 'CANCELLED') {
      throw new AppError(409, 'This booking is already cancelled');
    }

    const hadSuccessfulPayment = booking.status === 'CONFIRMED';

    const [updated] = await tx
      .update(bookings)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(eq(bookings.id, id))
      .returning();

    return { booking: updated, hadSuccessfulPayment };
  });
}

module.exports = { createBooking, listBookingsForUser, getBookingById, cancelBooking };
