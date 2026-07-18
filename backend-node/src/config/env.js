const path = require('path');
const dotenv = require('dotenv');

const backendRoot = path.resolve(__dirname, '..', '..');
const projectRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL || process.env.OFERTE_DATABASE_URL);
const dbPassword = String(process.env.DB_PASSWORD ?? process.env.OFERTE_DB_PASSWORD ?? '');

module.exports = {
  backendRoot,
  projectRoot,
  port: toInt(process.env.PORT || process.env.OFERTE_BACKEND_PORT, 8000),
  corsOrigin: process.env.CORS_ORIGIN || process.env.OFERTE_BACKEND_ALLOW_ORIGIN || '*',
  maxBodyBytes: process.env.MAX_BODY_BYTES || process.env.OFERTE_BACKEND_MAX_BODY_BYTES || '1mb',
  database: {
    hasDatabaseUrl,
    connectionString: process.env.DATABASE_URL || process.env.OFERTE_DATABASE_URL || undefined,
    host: hasDatabaseUrl ? undefined : process.env.DB_HOST || process.env.OFERTE_DB_HOST || 'localhost',
    port: hasDatabaseUrl ? undefined : toInt(process.env.DB_PORT || process.env.OFERTE_DB_PORT, 5432),
    database: hasDatabaseUrl ? undefined : process.env.DB_NAME || process.env.OFERTE_DB_NAME || 'oferte_e_ganhe',
    user: hasDatabaseUrl ? undefined : process.env.DB_USER || process.env.OFERTE_DB_USER || 'postgres',
    password: hasDatabaseUrl ? undefined : dbPassword,
    max: toInt(process.env.DB_POOL_MAX || process.env.OFERTE_DB_POOL_MAX, 5),
    idleTimeoutMillis: toInt(process.env.DB_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: toInt(process.env.DB_CONNECT_TIMEOUT_MS || process.env.OFERTE_DB_CONNECT_TIMEOUT, 5000),
    missingPassword: !hasDatabaseUrl && !dbPassword && String(process.env.DB_ALLOW_EMPTY_PASSWORD || '').trim() !== '1',
  },
  ai: {
    pythonBin: process.env.PYTHON_BIN || process.env.PYTHON || '',
    scriptPath: path.join(projectRoot, 'python', 'ia_envio_taloes.py'),
    outputPath: path.join(projectRoot, 'dados', 'ia_envio_taloes.json'),
    openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
    openRouterModel: process.env.OPENROUTER_MODEL || '',
  },
};
