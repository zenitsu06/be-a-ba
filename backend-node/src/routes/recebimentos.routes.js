const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { createReceipt, getReceipt, listReceipts } = require('../services');

const router = Router();

router.get('/recebimentos', asyncRoute(async (_req, res) => {
  res.json({ recebimentos_taloes: await listReceipts() });
}));

router.get('/recebimentos/:id', asyncRoute(async (req, res) => {
  res.json({ recebimento: await getReceipt(req.params.id) });
}));

router.post('/recebimentos', asyncRoute(async (req, res) => {
  res.status(201).json({ recebimento: await createReceipt(req.body) });
}));

module.exports = router;
