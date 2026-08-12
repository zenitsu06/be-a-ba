const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { deleteStore, getStoreByCode, listDuplicateStores, listStores, saveStore } = require('../services');

const router = Router();

router.get('/lojas', asyncRoute(async (_req, res) => {
  res.json({ lojas: await listStores() });
}));

router.get('/lojas/duplicadas', asyncRoute(async (_req, res) => {
  res.json({ duplicadas: await listDuplicateStores() });
}));

router.get('/lojas/:codigo', asyncRoute(async (req, res) => {
  res.json({ loja: await getStoreByCode(req.params.codigo) });
}));

router.post('/lojas', asyncRoute(async (req, res) => {
  res.status(201).json({ loja: await saveStore(req.body) });
}));

router.put('/lojas/:codigo', asyncRoute(async (req, res) => {
  res.json({ loja: await saveStore({ ...req.body, codigo_loja: req.params.codigo }) });
}));

router.delete('/lojas/:codigo', asyncRoute(async (req, res) => {
  res.json({ loja: await deleteStore(req.params.codigo) });
}));

module.exports = router;
