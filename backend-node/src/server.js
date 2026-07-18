const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middlewares/error-handler');

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: env.maxBodyBytes }));
app.use('/api', routes);
app.use(express.static(env.projectRoot));
app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module || module.parent?.filename?.endsWith('server.js')) {
  app.listen(env.port, () => {
    console.log(`Backend Node rodando em http://localhost:${env.port}`);
    console.log(`Frontend: http://localhost:${env.port}/login/login.html`);
  });
}

module.exports = app;
