const app = require('./app');
const env = require('./config/env');
const { closePool } = require('./db');

const server = app.listen(env.PORT, () => {
  console.log(`EVE Healthcare backend listening on port ${env.PORT}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);

  server.close(async () => {
    try {
      await closePool();
      console.log('Database pool closed.');
      process.exit(0);
    } catch (err) {
      console.error('Error while shutting down:', err.message);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = server;
