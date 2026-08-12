const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { closePool } = require('./database/conexao');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middlewares/error-handler');

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: env.maxBodyBytes }));
app.use('/api', routes);
app.use(express.static(env.frontendRoot));
app.use(notFoundHandler);
app.use(errorHandler);

let server = null;

async function shutdown() {
  const closeDatabase = async () => {
    try {
      await closePool();
    } finally {
      process.exit(0);
    }
  };

  if (server) {
    server.close(closeDatabase);
    return;
  }

  await closeDatabase();
}

if (require.main === module || module.parent?.filename?.endsWith('server.js')) {
  server = app.listen(env.port, () => {
    console.log(`Backend Node rodando em http://localhost:${env.port}`);
    console.log(`Frontend: http://localhost:${env.port}/login/login.html`);
  });

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

module.exports = app;
