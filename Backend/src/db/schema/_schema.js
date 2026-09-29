const { pgSchema } = require('drizzle-orm/pg-core');

// All EVE Healthcare tables live in this dedicated Postgres schema so they
// never collide with other applications' tables in the same database
// (e.g. anything in "public" or "aero_resolve").
const eveHealthcareSchema = pgSchema('eve_healthcare');

module.exports = { eveHealthcareSchema };
