const jwt = require('jsonwebtoken');

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

function createRejectingChain(err) {
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
    then: (resolve, reject) => Promise.reject(err).then(resolve, reject),
  };
  return chain;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999';
const BOOKING_ID = '55555555-5555-4555-8555-555555555555';

function authHeader(userId = USER_ID) {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  return `Bearer ${token}`;
}

function mockUserLookup(userId = USER_ID) {
  db.select.mockReturnValueOnce(
    createChain([{ id: userId, name: 'Test User', email: 'user@example.com', createdAt: 'x', updatedAt: 'x' }]),
  );
}

function makeBooking(overrides = {}) {
  return {
    id: BOOKING_ID,
    userId: USER_ID,
    testId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    centreId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    appointmentAt: new Date(Date.now() + 86400000).toISOString(),
    amount: '350.00',
    status: 'PENDING',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/payments', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/payments').send({ bookingId: BOOKING_ID });

    expect(res.status).toBe(401);
  });

  it('rejects invalid input', async () => {
    mockUserLookup();

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ bookingId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('returns 404 when the booking does not exist', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([]));

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ bookingId: BOOKING_ID, outcome: 'SUCCESS' });

    expect(res.status).toBe(404);
  });

  it("returns 404 when the booking belongs to a different user (can't pay for someone else's booking)", async () => {
    mockUserLookup(OTHER_USER_ID);
    tx.select.mockReturnValueOnce(createChain([makeBooking({ userId: USER_ID })]));

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader(OTHER_USER_ID))
      .send({ bookingId: BOOKING_ID, outcome: 'SUCCESS' });

    expect(res.status).toBe(404);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('processes a SUCCESS payment and confirms the booking, computing the amount from the booking itself', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'PENDING' })]));
    tx.insert.mockReturnValueOnce(
      createChain([{ id: 'p1', bookingId: BOOKING_ID, amount: '350.00', status: 'SUCCESS', providerEventId: null }]),
    );
    tx.update.mockReturnValueOnce(createChain([makeBooking({ status: 'CONFIRMED' })]));

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ bookingId: BOOKING_ID, outcome: 'SUCCESS', amount: '1.00' }); // client amount must be ignored

    expect(res.status).toBe(201);
    expect(res.body.data.payment.amount).toBe('350.00');
    expect(res.body.data.booking.status).toBe('CONFIRMED');
  });

  it('processes a FAILED payment and marks the booking FAILED (retryable)', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'PENDING' })]));
    tx.insert.mockReturnValueOnce(
      createChain([{ id: 'p1', bookingId: BOOKING_ID, amount: '350.00', status: 'FAILED', providerEventId: null }]),
    );
    tx.update.mockReturnValueOnce(createChain([makeBooking({ status: 'FAILED' })]));

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ bookingId: BOOKING_ID, outcome: 'FAILED' });

    expect(res.status).toBe(201);
    expect(res.body.data.payment.status).toBe('FAILED');
    expect(res.body.data.booking.status).toBe('FAILED');
  });

  it('allows a retry after a FAILED payment to succeed', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'FAILED' })]));
    tx.insert.mockReturnValueOnce(
      createChain([{ id: 'p2', bookingId: BOOKING_ID, amount: '350.00', status: 'SUCCESS', providerEventId: null }]),
    );
    tx.update.mockReturnValueOnce(createChain([makeBooking({ status: 'CONFIRMED' })]));

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ bookingId: BOOKING_ID, outcome: 'SUCCESS' });

    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('CONFIRMED');
  });

  it('rejects a payment attempt on an already-CONFIRMED booking with a 409', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'CONFIRMED' })]));

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ bookingId: BOOKING_ID, outcome: 'SUCCESS' });

    expect(res.status).toBe(409);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('rejects a payment attempt on a CANCELLED booking with a 409', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'CANCELLED' })]));

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ bookingId: BOOKING_ID, outcome: 'SUCCESS' });

    expect(res.status).toBe(409);
  });

  it('maps a one-success-per-booking constraint violation to a 409 (defense in depth)', async () => {
    mockUserLookup();
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'PENDING' })]));
    tx.insert.mockReturnValueOnce(
      createRejectingChain({ code: '23505', constraint: 'payments_one_success_per_booking_idx' }),
    );

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', authHeader())
      .send({ bookingId: BOOKING_ID, outcome: 'SUCCESS' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/payments/webhook', () => {
  it('rejects invalid input', async () => {
    const res = await request(app).post('/api/payments/webhook').send({ bookingId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });

  it('does not require authentication (simulates a provider callback)', async () => {
    db.select.mockReturnValueOnce(createChain([])); // providerEventId pre-check: no existing payment
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'PENDING' })]));
    tx.insert.mockReturnValueOnce(
      createChain([{ id: 'p1', bookingId: BOOKING_ID, amount: '350.00', status: 'SUCCESS', providerEventId: 'evt_1' }]),
    );
    tx.update.mockReturnValueOnce(createChain([makeBooking({ status: 'CONFIRMED' })]));

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ bookingId: BOOKING_ID, providerEventId: 'evt_1', status: 'SUCCESS' });

    expect(res.status).toBe(200);
    expect(res.body.data.idempotent).toBe(false);
    expect(res.body.data.booking.status).toBe('CONFIRMED');
  });

  it('returns 404 for an unknown booking id', async () => {
    db.select.mockReturnValueOnce(createChain([])); // pre-check: no existing payment
    tx.select.mockReturnValueOnce(createChain([])); // booking lookup: not found

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ bookingId: BOOKING_ID, providerEventId: 'evt_missing', status: 'SUCCESS' });

    expect(res.status).toBe(404);
  });

  it('is idempotent when the same providerEventId is seen again (pre-check short-circuit)', async () => {
    const existingPayment = {
      id: 'p1',
      bookingId: BOOKING_ID,
      amount: '350.00',
      status: 'SUCCESS',
      providerEventId: 'evt_1',
    };
    db.select
      .mockReturnValueOnce(createChain([existingPayment])) // pre-check finds it
      .mockReturnValueOnce(createChain([makeBooking({ status: 'CONFIRMED' })])); // booking lookup

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ bookingId: BOOKING_ID, providerEventId: 'evt_1', status: 'SUCCESS' });

    expect(res.status).toBe(200);
    expect(res.body.data.idempotent).toBe(true);
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('is idempotent under a concurrent-delivery race (unique violation on providerEventId)', async () => {
    const existingPayment = {
      id: 'p1',
      bookingId: BOOKING_ID,
      amount: '350.00',
      status: 'SUCCESS',
      providerEventId: 'evt_race',
    };
    db.select
      .mockReturnValueOnce(createChain([])) // pre-check: not found yet (race)
      .mockReturnValueOnce(createChain([existingPayment])) // post-catch: fresh lookup finds the winner's row
      .mockReturnValueOnce(createChain([makeBooking({ status: 'CONFIRMED' })])); // post-catch: booking lookup
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'PENDING' })]));
    tx.insert.mockReturnValueOnce(createRejectingChain({ code: '23505', constraint: 'payments_provider_event_id_unique' }));

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ bookingId: BOOKING_ID, providerEventId: 'evt_race', status: 'SUCCESS' });

    expect(res.status).toBe(200);
    expect(res.body.data.idempotent).toBe(true);
    expect(res.body.data.payment.id).toBe('p1');
  });

  it('rejects a webhook event for a CANCELLED booking with a 409', async () => {
    db.select.mockReturnValueOnce(createChain([]));
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'CANCELLED' })]));

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ bookingId: BOOKING_ID, providerEventId: 'evt_2', status: 'SUCCESS' });

    expect(res.status).toBe(409);
  });

  it('marks the booking FAILED on a FAILED webhook event', async () => {
    db.select.mockReturnValueOnce(createChain([]));
    tx.select.mockReturnValueOnce(createChain([makeBooking({ status: 'PENDING' })]));
    tx.insert.mockReturnValueOnce(
      createChain([{ id: 'p3', bookingId: BOOKING_ID, amount: '350.00', status: 'FAILED', providerEventId: 'evt_3' }]),
    );
    tx.update.mockReturnValueOnce(createChain([makeBooking({ status: 'FAILED' })]));

    const res = await request(app)
      .post('/api/payments/webhook')
      .send({ bookingId: BOOKING_ID, providerEventId: 'evt_3', status: 'FAILED' });

    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('FAILED');
  });
});
