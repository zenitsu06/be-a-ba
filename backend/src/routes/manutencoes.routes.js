const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { createMaintenance, getMaintenance, listMaintenance } = require('../services');

const router = Router();

router.get('/manutencoes', asyncRoute(async (_req, res) => {
  res.json({ manutencoes: await listMaintenance() });
}));

router.get('/manutencoes/:id', asyncRoute(async (req, res) => {
  res.json({ manutencao: await getMaintenance(req.params.id) });
}));

router.post('/manutencoes', asyncRoute(async (req, res) => {
  res.status(201).json({ manutencao: await createMaintenance(req.body) });
}));

module.exports = router;
