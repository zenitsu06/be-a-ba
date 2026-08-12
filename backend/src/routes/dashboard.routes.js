const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { dashboardInventory, dashboardShipments, dashboardSummary } = require('../services');

const router = Router();

router.get('/dashboard/resumo', asyncRoute(async (_req, res) => {
  res.json({ resumo: await dashboardSummary() });
}));

router.get('/dashboard/estoque', asyncRoute(async (_req, res) => {
  res.json(await dashboardInventory());
}));

router.get('/dashboard/envios', asyncRoute(async (_req, res) => {
  res.json(await dashboardShipments());
}));

module.exports = router;
