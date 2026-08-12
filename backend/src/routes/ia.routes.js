const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const {
  answerChatbot,
  listAnomalyReport,
  listWorkplaceNotifications,
  readAiAnalysis,
  runAiAnalysis,
} = require('../services');

const router = Router();

router.get('/ia/envio-taloes', asyncRoute(async (_req, res) => {
  res.json(await readAiAnalysis());
}));

router.post('/ia/envio-taloes/recalcular', asyncRoute(async (_req, res) => {
  res.json(await runAiAnalysis());
}));

router.get('/anomalias', asyncRoute(async (_req, res) => {
  res.json({ anomalias: await listAnomalyReport() });
}));

router.get('/notificacoes/workplace', asyncRoute(async (_req, res) => {
  res.json({ notificacoes: await listWorkplaceNotifications() });
}));

router.post('/chatbot', asyncRoute(async (req, res) => {
  res.json(await answerChatbot(req.body.pergunta));
}));

module.exports = router;
