const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { health } = require('../services');

const router = Router();

router.get('/health', asyncRoute(async (_req, res) => {
  res.json(await health());
}));

module.exports = router;
