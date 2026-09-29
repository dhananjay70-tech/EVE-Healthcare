const jwt = require('jsonwebtoken');

// `tx` simulates the transaction-scoped query builder passed into
// db.transaction(async (tx) => {...}); `db.transaction` here just invokes
// the callback with it directly, mirroring real commit/rollback semantics
// closely enough for unit tests (a real rollback-on-throw is covered by
// live verification, not by this mock).
jest.mock('../src/db', () => {
  const tx = { select: jest.fn(), insert: jest.fn(), update: jest.fn() };
  const db = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn((callback) => callback(tx)),
  };
  return { db, tx, pool: {}, closePool: jest.fn() };
});

const { db, tx } = require('../src/db');
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
    for: jest.fn(() => chain),
    values: jest.fn(() => chain),
    set: jest.fn(() => chain),
    returning: jest.fn(() => chain),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999';
const CENTRE = { id: '22222222-2222-4222-8222-222222222222', name: 'City Diagnostic Centre', location: 'Delhi' };
const TEST_ROW = { id: '33333333-3333-4333-8333-333333333333', centreId: CENTRE.id, name: 'CBC', price: '350.00' };
const OTHER_CENTRE = { id: '44444444-4444-4444-8444-444444444444', name: 'Other Centre', location: 'Mumbai' };

const BOOKING = {
  id: '55555555-5555-4555-8555-555555555555',
  userId: USER_ID,
  testId: TEST_ROW.id,
  centreId: CENTRE.id,
  appointmentAt: new Date(Date.now() + 86400000).toISOString(),
  amount: '350.00',
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function authHeader(userId = USER_ID) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  return `Bearer ${token}`;
}

function mockUserLookup(userId = USER_ID) {
  // src/middleware/authenticate.js looks the user up by id on every request.
  db.select.mockReturnValueOnce(
    createChain([{ id: userId, name: 'Test User', email: 'user@example.com', createdAt: 'x', updatedAt: 'x' }]),
  );
}

const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/bookings', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ testId: TEST_ROW.id, centreId: CENTRE.id, appointmentAt: FUTURE });

    expect(res.status).toBe(401);
  });

  it('rejects invalid input (bad ids, past date)', async () => {
    mockUserLookup();

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', authHeader())
      .send({ testId: 'not-a-uuid', centreId: CENTRE.id, appointmentAt: PAST });

    expect(res.status).toBe(400);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('rejects a past appointmentAt', async () => {
    mockUserLookup();

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', authHeader())
      .send({ testId: TEST_ROW.id, centreId: CENTRE.id, appointmentAt: PAST });

    expect(res.status).toBe(400);
    expect(res.body.message.toLowerCase()).toContain('future');
  });

  it('returns 404 when the centre does not exist', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([])); // centre lookup

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', authHeader())
      .send({ testId: TEST_ROW.id, centreId: CENTRE.id, appointmentAt: FUTURE });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/centre/i);
  });

  it('returns 404 when the test does not exist', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([CENTRE])).mockReturnValueOnce(createChain([])); // test lookup

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', authHeader())
      .send({ testId: TEST_ROW.id, centreId: CENTRE.id, appointmentAt: FUTURE });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/test/i);
  });

  it('rejects a test that does not belong to the given centre', async () => {
    mockUserLookup();
    tx.select
      .mockReturnValueOnce(createChain([OTHER_CENTRE]))
      .mockReturnValueOnce(createChain([TEST_ROW])); // test belongs to CENTRE, not OTHER_CENTRE

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', authHeader())
      .send({ testId: TEST_ROW.id, centreId: OTHER_CENTRE.id, appointmentAt: FUTURE });

    expect(res.status).toBe(400);
    expect(res.body.message.toLowerCase()).toContain('does not belong');
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('creates a booking with the amount computed server-side from the test price', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([CENTRE])).mockReturnValueOnce(createChain([TEST_ROW]));
    tx.insert.mockReturnValueOnce(createChain([BOOKING]));

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', authHeader())
      .send({ testId: TEST_ROW.id, centreId: CENTRE.id, appointmentAt: FUTURE, amount: '1.00' }); // client amount must be ignored

    expect(res.status).toBe(201);
    expect(res.body.data.booking.amount).toBe('350.00');
    expect(res.body.data.booking.status).toBe('PENDING');
    expect(tx.insert.mock.calls[0][0]).toBeDefined();
  });
});

describe('GET /api/bookings', () => {
  it('lists only the authenticated user\'s bookings, paginated', async () => {
    mockUserLookup();
    db.select
      .mockReturnValueOnce(createChain([{ ...BOOKING, test: TEST_ROW, centre: CENTRE }]))
      .mockReturnValueOnce(createChain([{ value: 1 }]));

    const res = await request(app).get('/api/bookings').set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.bookings).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
});

describe('GET /api/bookings/:id', () => {
  it('returns the booking when the requester owns it', async () => {
    mockUserLookup();
    db.select.mockReturnValueOnce(createChain([{ ...BOOKING, test: TEST_ROW, centre: CENTRE }]));

    const res = await request(app).get(`/api/bookings/${BOOKING.id}`).set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.booking.id).toBe(BOOKING.id);
  });

  it('returns 404 when the booking belongs to a different user', async () => {
    mockUserLookup(OTHER_USER_ID);
    db.select.mockReturnValueOnce(createChain([{ ...BOOKING, test: TEST_ROW, centre: CENTRE }])); // owned by USER_ID

    const res = await request(app)
      .get(`/api/bookings/${BOOKING.id}`)
      .set('Authorization', authHeader(OTHER_USER_ID));

    expect(res.status).toBe(404);
  });

  it('returns 404 when the booking does not exist', async () => {
    mockUserLookup();
    db.select.mockReturnValueOnce(createChain([]));

    const res = await request(app).get(`/api/bookings/${BOOKING.id}`).set('Authorization', authHeader());

    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed booking id', async () => {
    mockUserLookup();

    const res = await request(app).get('/api/bookings/not-a-uuid').set('Authorization', authHeader());

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/bookings/:id/cancel', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).patch(`/api/bookings/${BOOKING.id}/cancel`);

    expect(res.status).toBe(401);
  });

  it('returns 404 for a booking owned by a different user', async () => {
    mockUserLookup(OTHER_USER_ID);
    tx.select.mockReturnValueOnce(createChain([{ ...BOOKING, status: 'PENDING' }])); // owned by USER_ID

    const res = await request(app)
      .patch(`/api/bookings/${BOOKING.id}/cancel`)
      .set('Authorization', authHeader(OTHER_USER_ID));

    expect(res.status).toBe(404);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a booking that does not exist', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([]));

    const res = await request(app).patch(`/api/bookings/${BOOKING.id}/cancel`).set('Authorization', authHeader());

    expect(res.status).toBe(404);
  });

  it('cancels a PENDING booking with no refund note', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([{ ...BOOKING, status: 'PENDING' }]));
    tx.update.mockReturnValueOnce(createChain([{ ...BOOKING, status: 'CANCELLED' }]));

    const res = await request(app).patch(`/api/bookings/${BOOKING.id}/cancel`).set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('CANCELLED');
    expect(res.body.data.note).toBeUndefined();
  });

  it('cancels a CONFIRMED (paid) booking and includes a no-refund note', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([{ ...BOOKING, status: 'CONFIRMED' }]));
    tx.update.mockReturnValueOnce(createChain([{ ...BOOKING, status: 'CANCELLED' }]));

    const res = await request(app).patch(`/api/bookings/${BOOKING.id}/cancel`).set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('CANCELLED');
    expect(res.body.data.note).toMatch(/refund/i);
  });

  it('rejects cancelling an already-CANCELLED booking with a 409', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([{ ...BOOKING, status: 'CANCELLED' }]));

    const res = await request(app).patch(`/api/bookings/${BOOKING.id}/cancel`).set('Authorization', authHeader());

    expect(res.status).toBe(409);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed booking id', async () => {
    mockUserLookup();

    const res = await request(app).patch('/api/bookings/not-a-uuid/cancel').set('Authorization', authHeader());

    expect(res.status).toBe(400);
  });
});
