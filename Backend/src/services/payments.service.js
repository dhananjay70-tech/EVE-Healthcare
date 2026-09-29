const { eq } = require('drizzle-orm');
const { db } = require('../db');
const { payments } = require('../db/schema/payments');
const { bookings } = require('../db/schema/bookings');
const AppError = require('../utils/AppError');

const UNIQUE_VIOLATION = '23505';
const PROVIDER_EVENT_ID_CONSTRAINT = 'payments_provider_event_id_unique';
const ONE_SUCCESS_PER_BOOKING_CONSTRAINT = 'payments_one_success_per_booking_idx';

function simulateOutcome(explicitOutcome) {
  if (explicitOutcome) {
    return explicitOutcome;
  }
  // No real gateway — simulate a mostly-successful provider by default.
  return Math.random() < 0.8 ? 'SUCCESS' : 'FAILED';
}

function assertBookingIsPayable(booking) {
  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }
  if (booking.status === 'CONFIRMED') {
    throw new AppError(409, 'This booking has already been paid for');
  }
  if (booking.status === 'CANCELLED') {
    throw new AppError(409, 'This booking has been cancelled and cannot be paid for');
  }
}

async function findPaymentByProviderEventId(providerEventId) {
  const [payment] = await db.select().from(payments).where(eq(payments.providerEventId, providerEventId)).limit(1);
  return payment;
}

async function findBookingById(id) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return booking;
}

// A direct, authenticated "pay for my booking" call. Locks the booking row
// (`FOR UPDATE`) for the duration of the transaction so two concurrent
// payment attempts for the same booking serialize instead of racing.
async function createPayment({ bookingId, userId, outcome }) {
  try {
    return await db.transaction(async (tx) => {
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for('update');

      if (!booking || booking.userId !== userId) {
        throw new AppError(404, 'Booking not found');
      }

      assertBookingIsPayable(booking);

      const finalOutcome = simulateOutcome(outcome);

      const [payment] = await tx
        .insert(payments)
        .values({ bookingId, amount: booking.amount, status: finalOutcome })
        .returning();

      const [updatedBooking] = await tx
        .update(bookings)
        .set({ status: finalOutcome === 'SUCCESS' ? 'CONFIRMED' : 'FAILED', updatedAt: new Date() })
        .where(eq(bookings.id, bookingId))
        .returning();

      return { payment, booking: updatedBooking };
    });
  } catch (err) {
    // Defense-in-depth: the row lock above already prevents this in practice,
    // but if it's ever hit, report it the same way as the application-level check.
    if (err.code === UNIQUE_VIOLATION && err.constraint === ONE_SUCCESS_PER_BOOKING_CONSTRAINT) {
      throw new AppError(409, 'This booking has already been paid for');
    }
    throw err;
  }
}

// Simulates an inbound provider webhook. Idempotent on `providerEventId`:
// replaying the same event never creates a duplicate payment or re-applies
// a booking status change.
async function handleWebhookEvent({ bookingId, providerEventId, status }) {
  const existing = await findPaymentByProviderEventId(providerEventId);

  if (existing) {
    const booking = await findBookingById(existing.bookingId);
    return { payment: existing, booking, idempotent: true };
  }

  try {
    return await db.transaction(async (tx) => {
      const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for('update');

      assertBookingIsPayable(booking);

      const [payment] = await tx
        .insert(payments)
        .values({ bookingId, amount: booking.amount, status, providerEventId })
        .returning();

      const [updatedBooking] = await tx
        .update(bookings)
        .set({ status: status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED', updatedAt: new Date() })
        .where(eq(bookings.id, bookingId))
        .returning();

      return { payment, booking: updatedBooking, idempotent: false };
    });
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION && err.constraint === PROVIDER_EVENT_ID_CONSTRAINT) {
      // Lost a race with a concurrent delivery of the exact same event — the
      // transaction above was rolled back, so this is a fresh, safe read.
      const payment = await findPaymentByProviderEventId(providerEventId);
      const booking = payment ? await findBookingById(payment.bookingId) : null;
      return { payment, booking, idempotent: true };
    }

    if (err.code === UNIQUE_VIOLATION && err.constraint === ONE_SUCCESS_PER_BOOKING_CONSTRAINT) {
      throw new AppError(409, 'This booking already has a successful payment');
    }

    throw err;
  }
}

module.exports = { createPayment, handleWebhookEvent };
