const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.database.connectionString,
  host: env.database.host,
  port: env.database.port,
  database: env.database.database,
  user: env.database.user,
  password: env.database.password,
  max: env.database.max,
  idleTimeoutMillis: env.database.idleTimeoutMillis,
  connectionTimeoutMillis: env.database.connectionTimeoutMillis,
});

function assertDatabaseConfig() {
  if (env.database.missingPassword) {
    throw new Error('Configure DB_PASSWORD no backend-node/.env ou use DB_ALLOW_EMPTY_PASSWORD=1.');
  }
}

async function query(text, params = []) {
  assertDatabaseConfig();
  return pool.query(text, params);
}

async function withTransaction(callback) {
  assertDatabaseConfig();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function databaseHealth() {
  const startedAt = Date.now();
  const result = await query('SELECT current_database() AS database, NOW() AS checked_at');
  return {
    available: true,
    database: result.rows[0].database,
    latency_ms: Date.now() - startedAt,
  };
}

async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  withTransaction,
  databaseHealth,
  closePool,
};
