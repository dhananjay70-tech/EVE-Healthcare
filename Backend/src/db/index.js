const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

// A pool-level error (e.g. an idle client losing its connection) must not
// crash the process — log it and let the pool recover the next connection.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

const db = drizzle(pool);

async function closePool() {
  await pool.end();
}

module.exports = { db, pool, closePool };
