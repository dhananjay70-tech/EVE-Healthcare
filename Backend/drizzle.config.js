require('dotenv').config({ quiet: true });

const { defineConfig } = require('drizzle-kit');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run Drizzle Kit commands. Set it in .env first.');
}

module.exports = defineConfig({
  schema: './src/db/schema/*.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // This database is shared with other applications (e.g. "public",
  // "aero_resolve"). Scoping Drizzle Kit to only the eve_healthcare schema
  // keeps introspection/push commands from ever considering, and therefore
  // never touching, tables that belong to those other apps.
  schemaFilter: ['eve_healthcare'],
});
