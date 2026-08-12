const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { listHistory, listHistoryByStore, listHistoryByUser } = require('../services');

const router = Router();

router.get('/historico', asyncRoute(async (_req, res) => {
  res.json({ historico: await listHistory() });
}));

router.get('/historico/loja/:codigo', asyncRoute(async (req, res) => {
  res.json({ historico: await listHistoryByStore(req.params.codigo) });
}));

router.get('/historico/usuario/:matricula', asyncRoute(async (req, res) => {
  res.json({ historico: await listHistoryByUser(req.params.matricula) });
}));

module.exports = router;
