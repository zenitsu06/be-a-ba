const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { deleteInventory, getInventoryByStore, listInventory, updateInventory } = require('../services');

const router = Router();

router.get('/estoque', asyncRoute(async (_req, res) => {
  res.json({ estoque_lojas: await listInventory() });
}));

router.get('/estoque/:codigo', asyncRoute(async (req, res) => {
  res.json({ estoque: await getInventoryByStore(req.params.codigo) });
}));

router.post('/estoque', asyncRoute(async (req, res) => {
  res.json(await updateInventory(req.body));
}));

router.put('/estoque/:codigo', asyncRoute(async (req, res) => {
  res.json(await updateInventory({ ...req.body, cod_loja: req.params.codigo }));
}));

router.delete('/estoque/:codigo', asyncRoute(async (req, res) => {
  res.json({ estoque: await deleteInventory(req.params.codigo) });
}));

module.exports = router;
