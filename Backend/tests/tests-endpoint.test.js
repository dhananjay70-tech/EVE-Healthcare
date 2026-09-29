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

const TEST_WITH_CENTRE = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Complete Blood Count',
  description: 'Measures overall blood health.',
  price: '350.00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  centre: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'City Diagnostic Centre',
    location: 'Connaught Place, New Delhi',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/tests/:id', () => {
  it('returns test details including its centre and price', async () => {
    db.select.mockReturnValueOnce(createChain([TEST_WITH_CENTRE]));

    const res = await request(app).get(`/api/tests/${TEST_WITH_CENTRE.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.test).toEqual(TEST_WITH_CENTRE);
    expect(res.body.data.test.centre).toBeDefined();
    expect(res.body.data.test.price).toBe('350.00');
  });

  it('returns 404 when the test does not exist', async () => {
    db.select.mockReturnValueOnce(createChain([]));

    const res = await request(app).get(`/api/tests/${TEST_WITH_CENTRE.id}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await request(app).get('/api/tests/not-a-uuid');

    expect(res.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });
});

const CENTRE_ID = TEST_WITH_CENTRE.centre.id;
const NEW_TEST_ROW = {
  id: '33333333-3333-4333-8333-333333333333',
  centreId: CENTRE_ID,
  name: 'Thyroid Profile',
  description: null,
  price: '650.00',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('POST /api/tests (admin only)', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/tests').send({ centreId: CENTRE_ID, name: 'X', price: '10.00' });

    expect(res.status).toBe(401);
  });

  it('rejects a non-admin user with 403', async () => {
    mockUserLookup('USER');

    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', authHeader(USER_ID))
      .send({ centreId: CENTRE_ID, name: 'X', price: '10.00' });

    expect(res.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a non-positive price', async () => {
    mockUserLookup('ADMIN');

    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', authHeader(ADMIN_ID))
      .send({ centreId: CENTRE_ID, name: 'X', price: '0' });

    expect(res.status).toBe(400);
  });

  it('returns 404 when the centre does not exist', async () => {
    mockUserLookup('ADMIN');
    db.select.mockReturnValueOnce(createChain([])); // centre existence check

    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', authHeader(ADMIN_ID))
      .send({ centreId: CENTRE_ID, name: 'X', price: '10.00' });

    expect(res.status).toBe(404);
  });

  it('creates a test as admin, normalizing the price to 2 decimals', async () => {
    mockUserLookup('ADMIN');
    db.select.mockReturnValueOnce(createChain([{ id: CENTRE_ID }])); // centre exists
    db.insert.mockReturnValueOnce(createChain([NEW_TEST_ROW]));

    const res = await request(app)
      .post('/api/tests')
      .set('Authorization', authHeader(ADMIN_ID))
      .send({ centreId: CENTRE_ID, name: 'Thyroid Profile', price: 650 });

    expect(res.status).toBe(201);
    expect(res.body.data.test.price).toBe('650.00');
  });
});

describe('PATCH /api/tests/:id (admin only)', () => {
  it('rejects a non-admin user with 403', async () => {
    mockUserLookup('USER');

    const res = await request(app)
      .patch(`/api/tests/${NEW_TEST_ROW.id}`)
      .set('Authorization', authHeader(USER_ID))
      .send({ price: '700.00' });

    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('rejects an empty update body', async () => {
    mockUserLookup('ADMIN');

    const res = await request(app).patch(`/api/tests/${NEW_TEST_ROW.id}`).set('Authorization', authHeader(ADMIN_ID)).send({});

    expect(res.status).toBe(400);
  });

  it('does not accept centreId as an updatable field', async () => {
    mockUserLookup('ADMIN');
    db.update.mockReturnValueOnce(createChain([{ ...NEW_TEST_ROW, price: '700.00' }]));

    const res = await request(app)
      .patch(`/api/tests/${NEW_TEST_ROW.id}`)
      .set('Authorization', authHeader(ADMIN_ID))
      .send({ price: '700.00', centreId: '99999999-9999-4999-8999-999999999999' });

    expect(res.status).toBe(200);
    // The service only ever receives {price}; centreId was stripped by Zod
    // since the update schema doesn't declare it.
    const setArg = db.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setArg.centreId).toBeUndefined();
  });

  it('returns 404 when the test does not exist', async () => {
    mockUserLookup('ADMIN');
    db.update.mockReturnValueOnce(createChain([]));

    const res = await request(app)
      .patch(`/api/tests/${NEW_TEST_ROW.id}`)
      .set('Authorization', authHeader(ADMIN_ID))
      .send({ price: '700.00' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/tests/:id (admin only)', () => {
  it('rejects a non-admin user with 403', async () => {
    mockUserLookup('USER');

    const res = await request(app).delete(`/api/tests/${NEW_TEST_ROW.id}`).set('Authorization', authHeader(USER_ID));

    expect(res.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('rejects deletion with a 409 when the test has existing bookings', async () => {
    mockUserLookup('ADMIN');
    db.select
      .mockReturnValueOnce(createChain([NEW_TEST_ROW])) // existence check
      .mockReturnValueOnce(createChain([{ id: 'some-booking-id' }])); // booking reference found

    const res = await request(app).delete(`/api/tests/${NEW_TEST_ROW.id}`).set('Authorization', authHeader(ADMIN_ID));

    expect(res.status).toBe(409);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('deletes a test with no bookings as admin', async () => {
    mockUserLookup('ADMIN');
    db.select
      .mockReturnValueOnce(createChain([NEW_TEST_ROW])) // existence check
      .mockReturnValueOnce(createChain([])); // no booking reference
    db.delete.mockReturnValueOnce(createChain(undefined));

    const res = await request(app).delete(`/api/tests/${NEW_TEST_ROW.id}`).set('Authorization', authHeader(ADMIN_ID));

    expect(res.status).toBe(204);
  });
});
