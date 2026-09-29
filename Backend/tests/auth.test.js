const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock the shared DB module so these tests never touch a real PostgreSQL
// instance. Everything that resolves to src/db/index.js (however it was
// required) picks up this mock, since Jest matches by resolved file path.
jest.mock('../src/db', () => ({
  db: { select: jest.fn(), insert: jest.fn() },
  pool: {},
  closePool: jest.fn(),
}));

const { db } = require('../src/db');
const app = require('../src/app');
const env = require('../src/config/env');
const request = require('supertest');

function mockSelectResult(rows) {
  db.select.mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

function mockInsertResult(rows) {
  db.insert.mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue(rows),
    }),
  });
}

const NOW = new Date().toISOString();

function makeUserRow(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: bcrypt.hashSync('CorrectPassword123', 10),
    role: 'USER',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function expectNoPasswordHash(body) {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(/passwordHash|password_hash/i);
  expect(serialized).not.toContain('CorrectPassword123');
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/signup', () => {
  it('creates a user and returns safe user data', async () => {
    mockSelectResult([]); // no existing user with this email
    mockInsertResult([makeUserRow()]);

    const res = await request(app).post('/api/auth/signup').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'CorrectPassword123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ name: 'Test User', email: 'test@example.com' });
    expect(res.body.data.user.id).toBeDefined();
    expectNoPasswordHash(res.body);
  });

  it('cannot self-elevate its role via the signup body', async () => {
    mockSelectResult([]);
    mockInsertResult([makeUserRow()]); // service always inserts with the DB default (USER); role isn't accepted as input

    await request(app).post('/api/auth/signup').send({
      name: 'Test User',
      email: 'test@example.com',
      password: 'CorrectPassword123',
      role: 'ADMIN', // must be ignored — Zod strips unknown fields, service never reads it
    });

    const insertedValues = db.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertedValues.role).toBeUndefined();
  });

  it('rejects invalid input with a 400', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: '',
      email: 'not-an-email',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects a duplicate email with a 409 and no internal details', async () => {
    mockSelectResult([makeUserRow()]); // email already exists

    const res = await request(app).post('/api/auth/signup').send({
      name: 'Another User',
      email: 'test@example.com',
      password: 'CorrectPassword123',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.message.toLowerCase()).toContain('already exists');
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and returns a token plus safe user data', async () => {
    mockSelectResult([makeUserRow()]);

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'CorrectPassword123',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toMatchObject({ email: 'test@example.com' });
    expectNoPasswordHash(res.body);

    const decoded = jwt.verify(res.body.data.token, env.JWT_SECRET);
    expect(decoded.sub).toBe(res.body.data.user.id);
  });

  it('rejects an incorrect password with a generic 401', async () => {
    mockSelectResult([makeUserRow()]);

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'WrongPassword123',
    });

    expect(res.status).toBe(401);
    expect(res.body.message.toLowerCase()).toContain('invalid email or password');
  });

  it('rejects an unknown email with the same generic 401', async () => {
    mockSelectResult([]);

    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'CorrectPassword123',
    });

    expect(res.status).toBe(401);
    expect(res.body.message.toLowerCase()).toContain('invalid email or password');
  });
});

describe('GET /api/auth/me', () => {
  it('rejects a missing token with a 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a malformed/invalid token with a 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects an expired token with a 401', async () => {
    const user = makeUserRow();
    const expiredToken = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: -10 });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns the authenticated user profile for a valid token', async () => {
    const user = makeUserRow();
    mockSelectResult([user]);
    const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: user.id, name: user.name, email: user.email });
    expectNoPasswordHash(res.body);
  });
});
