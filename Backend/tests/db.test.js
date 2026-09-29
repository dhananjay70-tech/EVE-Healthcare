// Constructing a pg Pool does not open a connection eagerly, so this module
// can be safely required in tests without a running PostgreSQL instance.
describe('Database connection module (src/db/index.js)', () => {
  const ORIGINAL_ENV = process.env;

  beforeAll(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/eve_healthcare_test',
      JWT_SECRET: 'test_secret',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('exports a drizzle db instance, a pg pool, and a closePool function', () => {
    const { db, pool, closePool } = require('../src/db');

    expect(db).toBeDefined();
    expect(pool).toBeDefined();
    expect(typeof closePool).toBe('function');
  });

  it('does not create a new pool on repeated requires (module caching)', () => {
    const first = require('../src/db');
    const second = require('../src/db');

    expect(first.pool).toBe(second.pool);
  });
});
