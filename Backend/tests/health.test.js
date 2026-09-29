const request = require('supertest');
const app = require('../src/app');

describe('GET /', () => {
  it('returns the health-check response', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'EVE Healthcare Backend is running',
    });
  });
});

describe('Unknown routes', () => {
  it('returns a 404 JSON response for an unknown route', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
