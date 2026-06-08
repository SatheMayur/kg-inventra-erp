const knex = require('knex');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set. Refusing to start without a database configuration.');
}

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 }
});

module.exports = db;
