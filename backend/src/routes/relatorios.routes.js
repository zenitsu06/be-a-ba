const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { listSentReports, reportColumns, reportRows, submitReport, toCsv } = require('../services');

const router = Router();

router.get('/relatorios/enviados', asyncRoute(async (_req, res) => {
  res.json({ relatorios: await listSentReports() });
}));

router.get('/relatorios/:tipo.csv', asyncRoute(async (req, res) => {
  const rows = await reportRows(req.params.tipo, req.query);
  const csv = toCsv(rows, reportColumns(req.params.tipo));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.tipo}.csv"`);
  res.send(`\uFEFF${csv}`);
}));

router.get('/relatorios/:tipo/exportar', asyncRoute(async (req, res) => {
  const rows = await reportRows(req.params.tipo, req.query);
  const csv = toCsv(rows, reportColumns(req.params.tipo));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.tipo}.csv"`);
  res.send(`\uFEFF${csv}`);
}));

router.get('/relatorios/:tipo', asyncRoute(async (req, res) => {
  res.json({ tipo: req.params.tipo, linhas: await reportRows(req.params.tipo, req.query) });
}));

router.post('/relatorios/enviar', asyncRoute(async (req, res) => {
  res.status(201).json({ relatorio: await submitReport(req.body) });
}));

router.post('/relatorios/exportar', asyncRoute(async (req, res) => {
  const rows = await reportRows(req.body.tipo, req.body.filtros || {});
  res.json({
    nome: `${req.body.tipo || 'relatorio'}.csv`,
    csv: toCsv(rows, reportColumns(req.body.tipo)),
  });
}));

module.exports = router;
