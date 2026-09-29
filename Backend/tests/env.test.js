describe('Environment configuration (src/config/env.js)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws when required variables are missing', () => {
    // dotenv only fills in keys that are absent from process.env, so an
    // empty string (rather than delete) keeps it from re-injecting these
    // from the real .env file during the test.
    process.env.DATABASE_URL = '';
    process.env.JWT_SECRET = '';

    expect(() => require('../src/config/env')).toThrow();
  });

  it('loads configuration when required variables are present', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/eve_healthcare_test';
    process.env.JWT_SECRET = 'test_secret';
    process.env.PORT = '5001';

    const env = require('../src/config/env');

    expect(env.DATABASE_URL).toBe(process.env.DATABASE_URL);
    expect(env.JWT_SECRET).toBe('test_secret');
    expect(env.PORT).toBe(5001);
    expect(env.JWT_EXPIRES_IN).toBe('1d');
  });
});
