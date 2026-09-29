const app = require('../src/app');

describe('Express application initialization', () => {
  it('exports an Express app instance without starting a listening server', () => {
    expect(typeof app).toBe('function');
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
    expect(typeof app.get).toBe('function');
  });
});
