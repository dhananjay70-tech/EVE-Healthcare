const { eq } = require('drizzle-orm');
const { db } = require('../db');
const { tests } = require('../db/schema/tests');
const { centres } = require('../db/schema/centres');
const { bookings } = require('../db/schema/bookings');
const AppError = require('../utils/AppError');

async function getTestById(id) {
  const [row] = await db
    .select({
      id: tests.id,
      name: tests.name,
      description: tests.description,
      price: tests.price,
      createdAt: tests.createdAt,
      updatedAt: tests.updatedAt,
      centre: {
        id: centres.id,
        name: centres.name,
        location: centres.location,
      },
    })
    .from(tests)
    .innerJoin(centres, eq(tests.centreId, centres.id))
    .where(eq(tests.id, id))
    .limit(1);

  if (!row) {
    throw new AppError(404, 'Test not found');
  }

  return row;
}

async function createTest({ centreId, name, description, price }) {
  const [centre] = await db.select().from(centres).where(eq(centres.id, centreId)).limit(1);

  if (!centre) {
    throw new AppError(404, 'Centre not found');
  }

  const [test] = await db.insert(tests).values({ centreId, name, description, price }).returning();
  return test;
}

// centreId is not part of `updates` — see tests.validators.js for why a
// test's centre is immutable after creation.
async function updateTest(id, updates) {
  const [updated] = await db
    .update(tests)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(tests.id, id))
    .returning();

  if (!updated) {
    throw new AppError(404, 'Test not found');
  }

  return updated;
}

// A test with any existing booking cannot be deleted — that would corrupt
// that booking's history (its test_id would dangle). Price changes are
// safe by contrast: bookings.amount is a frozen snapshot taken at booking
// time, so editing tests.price never retroactively affects a past booking.
async function deleteTest(id) {
  const [existing] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);

  if (!existing) {
    throw new AppError(404, 'Test not found');
  }

  const [bookingRef] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.testId, id)).limit(1);

  if (bookingRef) {
    throw new AppError(409, 'Cannot delete a test that has existing bookings');
  }

  await db.delete(tests).where(eq(tests.id, id));
}

module.exports = { getTestById, createTest, updateTest, deleteTest };
