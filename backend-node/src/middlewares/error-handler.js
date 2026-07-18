const AppError = require('../utils/AppError');

function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ erro: 'Rota nao encontrada.' });
    return;
  }
  res.status(404).send('Arquivo nao encontrado.');
}

function errorHandler(error, _req, res, _next) {
  const status = error instanceof AppError ? error.status : 500;
  res.status(status).json({ erro: error.message || 'Erro interno do servidor.' });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
