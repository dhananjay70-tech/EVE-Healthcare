const { eq, asc, count } = require('drizzle-orm');
const { db } = require('../db');
const { centres } = require('../db/schema/centres');
const { tests } = require('../db/schema/tests');
const { bookings } = require('../db/schema/bookings');
const AppError = require('../utils/AppError');

function buildPagination({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

async function listCentres({ page, limit }) {
  const offset = (page - 1) * limit;

  const [rows, [{ value: total }]] = await Promise.all([
    db.select().from(centres).orderBy(asc(centres.name)).limit(limit).offset(offset),
    db.select({ value: count() }).from(centres),
  ]);

  return { centres: rows, pagination: buildPagination({ page, limit, total }) };
}

async function getCentreById(id) {
  const [centre] = await db.select().from(centres).where(eq(centres.id, id)).limit(1);

  if (!centre) {
    throw new AppError(404, 'Centre not found');
  }

  return centre;
}

async function listTestsByCentre(centreId, { page, limit }) {
  await getCentreById(centreId); // throws 404 if the centre itself doesn't exist

  const offset = (page - 1) * limit;

  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(tests)
      .where(eq(tests.centreId, centreId))
      .orderBy(asc(tests.name))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(tests).where(eq(tests.centreId, centreId)),
  ]);

  return { tests: rows, pagination: buildPagination({ page, limit, total }) };
}

async function createCentre({ name, location }) {
  const [centre] = await db.insert(centres).values({ name, location }).returning();
  return centre;
}

async function updateCentre(id, updates) {
  const [updated] = await db
    .update(centres)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(centres.id, id))
    .returning();

  if (!updated) {
    throw new AppError(404, 'Centre not found');
  }

  return updated;
}

// A centre with any existing booking (directly, or via one of its tests)
// cannot be deleted — that would corrupt those bookings' history. Tests
// under the centre that have no bookings are removed automatically
// (ON DELETE CASCADE on tests.centre_id) once the centre itself is deleted.
async function deleteCentre(id) {
  const [existing] = await db.select().from(centres).where(eq(centres.id, id)).limit(1);

  if (!existing) {
    throw new AppError(404, 'Centre not found');
  }

  const [bookingRef] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.centreId, id)).limit(1);

  if (bookingRef) {
    throw new AppError(409, 'Cannot delete a centre that has existing bookings');
  }

  await db.delete(centres).where(eq(centres.id, id));
}

module.exports = { listCentres, getCentreById, listTestsByCentre, createCentre, updateCentre, deleteCentre };
