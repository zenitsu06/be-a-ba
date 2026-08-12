const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { createShipment, getShipment, listShipments, updateShipment } = require('../services');

const router = Router();

router.get('/envios', asyncRoute(async (_req, res) => {
  res.json({ envios_taloes: await listShipments() });
}));

router.get('/envios/:id', asyncRoute(async (req, res) => {
  res.json({ envio: await getShipment(req.params.id) });
}));

router.post('/envios', asyncRoute(async (req, res) => {
  res.status(201).json({ envio: await createShipment(req.body) });
}));

router.post('/envios/editar', asyncRoute(async (req, res) => {
  res.json({ envio: await updateShipment(req.body) });
}));

module.exports = router;
