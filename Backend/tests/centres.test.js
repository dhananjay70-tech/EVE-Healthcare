jest.mock('../src/db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
  pool: {},
  closePool: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { db } = require('../src/db');
const app = require('../src/app');
const env = require('../src/config/env');
const request = require('supertest');

// A Drizzle query builder is "thenable" at every step of the chain, so
// awaiting it at whatever point the real code stops chaining still resolves.
// This mock mirrors that: every method returns the same chain object, which
// itself resolves to `result` when awaited.
function createChain(result) {
  const chain = {
    from: jest.fn(() => chain),
    where: jest.fn(() => chain),
    orderBy: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    offset: jest.fn(() => chain),
    innerJoin: jest.fn(() => chain),
    values: jest.fn(() => chain),
    set: jest.fn(() => chain),
    returning: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const ADMIN_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = '77777777-7777-4777-8777-777777777777';

function authHeader(userId) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  return `Bearer ${token}`;
}

function mockUserLookup(role, userId = role === 'ADMIN' ? ADMIN_ID : USER_ID) {
  db.select.mockReturnValueOnce(
    createChain([{ id: userId, name: 'Test User', email: 'user@example.com', role, createdAt: 'x', updatedAt: 'x' }]),
  );
}

const CENTRE = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'City Diagnostic Centre',
  location: 'Connaught Place, New Delhi',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const TEST_ROW = {
  id: '22222222-2222-4222-8222-222222222222',
  centreId: CENTRE.id,
  name: 'Complete Blood Count',
  description: 'Measures overall blood health.',
  price: '350.00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/centres', () => {
  it('returns a paginated list of centres with metadata', async () => {
    db.select
      .mockReturnValueOnce(createChain([CENTRE]))
      .mockReturnValueOnce(createChain([{ value: 3 }]));

    const res = await request(app).get('/api/centres?page=1&limit=20');

    expect(res.status).toBe(200);
    expect(res.body.data.centres).toEqual([CENTRE]);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });
  });

  it('applies default pagination when no query params are given', async () => {
    db.select.mockReturnValueOnce(createChain([CENTRE])).mockReturnValueOnce(createChain([{ value: 1 }]));

    const res = await request(app).get('/api/centres');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('rejects an invalid pagination query with a 400', async () => {
    const res = await request(app).get('/api/centres?limit=0');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects a limit above the maximum with a 400', async () => {
    const res = await request(app).get('/api/centres?limit=500');

    expect(res.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('GET /api/centres/:id', () => {
  it('returns centre details', async () => {
    db.select.mockReturnValueOnce(createChain([CENTRE]));

    const res = await request(app).get(`/api/centres/${CENTRE.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.centre).toEqual(CENTRE);
  });

  it('returns 404 when the centre does not exist', async () => {
    db.select.mockReturnValueOnce(createChain([]));

    const res = await request(app).get(`/api/centres/${CENTRE.id}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(app).get('/api/centres/not-a-uuid');

    expect(res.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('GET /api/centres/:id/tests', () => {
  it('returns a paginated list of tests belonging to the centre', async () => {
    db.select
      .mockReturnValueOnce(createChain([CENTRE])) // centre existence check
      .mockReturnValueOnce(createChain([TEST_ROW])) // tests page
      .mockReturnValueOnce(createChain([{ value: 1 }])); // tests count

    const res = await request(app).get(`/api/centres/${CENTRE.id}/tests`);

    expect(res.status).toBe(200);
    expect(res.body.data.tests).toEqual([TEST_ROW]);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('returns 404 when the centre does not exist', async () => {
    db.select.mockReturnValueOnce(createChain([])); // centre existence check fails

    const res = await request(app).get(`/api/centres/${CENTRE.id}/tests`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for a malformed centre id', async () => {
    const res = await request(app).get('/api/centres/not-a-uuid/tests');

    expect(res.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('POST /api/centres (admin only)', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/centres').send({ name: 'X', location: 'Y' });

    expect(res.status).toBe(401);
  });

  it('rejects a non-admin user with 403', async () => {
    mockUserLookup('USER');

    const res = await request(app)
      .post('/api/centres')
      .set('Authorization', authHeader(USER_ID))
      .send({ name: 'X', location: 'Y' });

    expect(res.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    mockUserLookup('ADMIN');

    const res = await request(app).post('/api/centres').set('Authorization', authHeader(ADMIN_ID)).send({ name: '' });

    expect(res.status).toBe(400);
  });

  it('creates a centre as admin', async () => {
    mockUserLookup('ADMIN');
    db.insert.mockReturnValueOnce(createChain([CENTRE]));

    const res = await request(app)
      .post('/api/centres')
      .set('Authorization', authHeader(ADMIN_ID))
      .send({ name: CENTRE.name, location: CENTRE.location });

    expect(res.status).toBe(201);
    expect(res.body.data.centre).toEqual(CENTRE);
  });
});

describe('PATCH /api/centres/:id (admin only)', () => {
  it('rejects a non-admin user with 403', async () => {
    mockUserLookup('USER');

    const res = await request(app)
      .patch(`/api/centres/${CENTRE.id}`)
      .set('Authorization', authHeader(USER_ID))
      .send({ name: 'New Name' });

    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects an empty update body', async () => {
    mockUserLookup('ADMIN');

    const res = await request(app).patch(`/api/centres/${CENTRE.id}`).set('Authorization', authHeader(ADMIN_ID)).send({});

    expect(res.status).toBe(400);
  });

  it('updates a centre as admin', async () => {
    mockUserLookup('ADMIN');
    db.update.mockReturnValueOnce(createChain([{ ...CENTRE, name: 'Updated Name' }]));

    const res = await request(app)
      .patch(`/api/centres/${CENTRE.id}`)
      .set('Authorization', authHeader(ADMIN_ID))
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.centre.name).toBe('Updated Name');
  });

  it('returns 404 when updating a centre that does not exist', async () => {
    mockUserLookup('ADMIN');
    db.update.mockReturnValueOnce(createChain([]));

    const res = await request(app)
      .patch(`/api/centres/${CENTRE.id}`)
      .set('Authorization', authHeader(ADMIN_ID))
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/centres/:id (admin only)', () => {
  it('rejects a non-admin user with 403', async () => {
    mockUserLookup('USER');

    const res = await request(app).delete(`/api/centres/${CENTRE.id}`).set('Authorization', authHeader(USER_ID));

    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the centre does not exist', async () => {
    mockUserLookup('ADMIN');
    db.select.mockReturnValueOnce(createChain([])); // existence check

    const res = await request(app).delete(`/api/centres/${CENTRE.id}`).set('Authorization', authHeader(ADMIN_ID));

    expect(res.status).toBe(404);
  });

  it('rejects deletion with a 409 when the centre has existing bookings', async () => {
    mockUserLookup('ADMIN');
    db.select
      .mockReturnValueOnce(createChain([CENTRE])) // existence check
      .mockReturnValueOnce(createChain([{ id: 'some-booking-id' }])); // booking reference found

    const res = await request(app).delete(`/api/centres/${CENTRE.id}`).set('Authorization', authHeader(ADMIN_ID));

    expect(res.status).toBe(409);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('deletes a centre with no bookings as admin', async () => {
    mockUserLookup('ADMIN');
    db.select
      .mockReturnValueOnce(createChain([CENTRE])) // existence check
      .mockReturnValueOnce(createChain([])); // no booking reference
    db.delete.mockReturnValueOnce(createChain(undefined));

    const res = await request(app).delete(`/api/centres/${CENTRE.id}`).set('Authorization', authHeader(ADMIN_ID));

    expect(res.status).toBe(204);
  });
});
