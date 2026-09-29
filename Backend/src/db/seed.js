const { eq, and } = require('drizzle-orm');
const { db, pool } = require('./index');
const { centres } = require('./schema/centres');
const { tests } = require('./schema/tests');

const SAMPLE_CENTRES = [
  { name: 'City Diagnostic Centre', location: 'Connaught Place, New Delhi' },
  { name: 'Health First Diagnostics', location: 'Andheri West, Mumbai' },
  { name: 'Metro Medical Labs', location: 'Koramangala, Bengaluru' },
];

const SAMPLE_TESTS_BY_CENTRE = {
  'City Diagnostic Centre': [
    { name: 'Complete Blood Count', description: 'Measures overall blood health.', price: '350.00' },
    { name: 'Blood Sugar Test', description: 'Measures fasting or random blood glucose.', price: '150.00' },
  ],
  'Health First Diagnostics': [
    { name: 'Thyroid Profile', description: 'Measures TSH, T3 and T4 levels.', price: '650.00' },
    { name: 'Complete Blood Count', description: 'Measures overall blood health.', price: '380.00' },
  ],
  'Metro Medical Labs': [
    { name: 'Blood Sugar Test', description: 'Measures fasting or random blood glucose.', price: '180.00' },
    { name: 'Thyroid Profile', description: 'Measures TSH, T3 and T4 levels.', price: '600.00' },
  ],
};

// Looks each row up by its natural key first so re-running the seed never
// creates duplicate centres or tests.
async function seedCentres() {
  const centreIdByName = {};

  for (const centre of SAMPLE_CENTRES) {
    const existing = await db.select().from(centres).where(eq(centres.name, centre.name)).limit(1);

    if (existing.length > 0) {
      centreIdByName[centre.name] = existing[0].id;
      continue;
    }

    const [inserted] = await db.insert(centres).values(centre).returning();
    centreIdByName[centre.name] = inserted.id;
  }

  return centreIdByName;
}

async function seedTests(centreIdByName) {
  for (const [centreName, centreTests] of Object.entries(SAMPLE_TESTS_BY_CENTRE)) {
    const centreId = centreIdByName[centreName];

    for (const test of centreTests) {
      const existing = await db
        .select()
        .from(tests)
        .where(and(eq(tests.centreId, centreId), eq(tests.name, test.name)))
        .limit(1);

      if (existing.length > 0) {
        continue;
      }

      await db.insert(tests).values({ ...test, centreId });
    }
  }
}

async function seed() {
  console.log('Seeding sample diagnostic centres and tests...');
  const centreIdByName = await seedCentres();
  await seedTests(centreIdByName);
  console.log('Seeding complete.');
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
