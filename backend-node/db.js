const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL || process.env.OFERTE_DATABASE_URL);
const password = String(process.env.DB_PASSWORD ?? process.env.OFERTE_DB_PASSWORD ?? '');
const allowEmptyPassword = String(process.env.DB_ALLOW_EMPTY_PASSWORD || '').trim() === '1';
const missingPassword = !hasDatabaseUrl && !password && !allowEmptyPassword;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.OFERTE_DATABASE_URL || undefined,
  host: hasDatabaseUrl ? undefined : process.env.DB_HOST || process.env.OFERTE_DB_HOST || 'localhost',
  port: hasDatabaseUrl ? undefined : toInt(process.env.DB_PORT || process.env.OFERTE_DB_PORT, 5432),
  database: hasDatabaseUrl ? undefined : process.env.DB_NAME || process.env.OFERTE_DB_NAME || 'oferte_e_ganhe',
  user: hasDatabaseUrl ? undefined : process.env.DB_USER || process.env.OFERTE_DB_USER || 'postgres',
  password: hasDatabaseUrl ? undefined : password,
  max: toInt(process.env.DB_POOL_MAX || process.env.OFERTE_DB_POOL_MAX, 5),
  idleTimeoutMillis: toInt(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  connectionTimeoutMillis: toInt(process.env.DB_CONNECT_TIMEOUT_MS || process.env.OFERTE_DB_CONNECT_TIMEOUT, 5000),
});

async function query(text, params = []) {
  if (missingPassword) {
    throw new Error('Configure DB_PASSWORD no backend-node/.env ou use DB_ALLOW_EMPTY_PASSWORD=1.');
  }
  return pool.query(text, params);
}

async function withTransaction(callback) {
  if (missingPassword) {
    throw new Error('Configure DB_PASSWORD no backend-node/.env ou use DB_ALLOW_EMPTY_PASSWORD=1.');
  }
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
