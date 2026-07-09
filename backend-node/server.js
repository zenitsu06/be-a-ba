const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const {
  AppError,
  answerChatbot,
  authenticate,
  createReceipt,
  createShipment,
  deleteProfile,
  health,
  listAnomalyReport,
  listDuplicateStores,
  listInventory,
  listProfiles,
  listReceipts,
  listSentReports,
  listShipments,
  listStores,
  listUsers,
  listWorkplaceNotifications,
  readAiAnalysis,
  reportRows,
  runAiAnalysis,
  saveProfile,
  saveStore,
  saveUser,
  setUserStatus,
  submitReport,
  toCsv,
  updateInventory,
  updateShipment,
} = require('./services');

const app = express();
const port = Number.parseInt(process.env.PORT || process.env.OFERTE_BACKEND_PORT || '8000', 10);
const projectRoot = path.resolve(__dirname, '..');

app.use(cors({ origin: process.env.CORS_ORIGIN || process.env.OFERTE_BACKEND_ALLOW_ORIGIN || '*' }));
app.use(express.json({ limit: process.env.MAX_BODY_BYTES || process.env.OFERTE_BACKEND_MAX_BODY_BYTES || '1mb' }));

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  res.json(await health());
}));

app.get('/api/usuarios', asyncRoute(async (_req, res) => {
  res.json({ usuarios: await listUsers() });
}));

app.get('/api/perfis', asyncRoute(async (_req, res) => {
  res.json({ perfis: await listProfiles() });
}));

app.get('/api/lojas', asyncRoute(async (_req, res) => {
  res.json({ lojas: await listStores() });
}));

app.get('/api/lojas/duplicadas', asyncRoute(async (_req, res) => {
  res.json({ duplicadas: await listDuplicateStores() });
}));

app.get('/api/estoque', asyncRoute(async (_req, res) => {
  res.json({ estoque_lojas: await listInventory() });
}));

app.get('/api/envios', asyncRoute(async (_req, res) => {
  res.json({ envios_taloes: await listShipments() });
}));

app.get('/api/recebimentos', asyncRoute(async (_req, res) => {
  res.json({ recebimentos_taloes: await listReceipts() });
}));

app.get('/api/ia/envio-taloes', asyncRoute(async (_req, res) => {
  res.json(await readAiAnalysis());
}));

app.get('/api/anomalias', asyncRoute(async (_req, res) => {
  res.json({ anomalias: await listAnomalyReport() });
}));

app.get('/api/notificacoes/workplace', asyncRoute(async (_req, res) => {
  res.json({ notificacoes: await listWorkplaceNotifications() });
}));

app.get('/api/relatorios/enviados', asyncRoute(async (_req, res) => {
  res.json({ relatorios: await listSentReports() });
}));

app.get('/api/relatorios/:tipo.csv', asyncRoute(async (req, res) => {
  const rows = await reportRows(req.params.tipo, req.query);
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.tipo}.csv"`);
  res.send(`\uFEFF${csv}`);
}));

app.get('/api/relatorios/:tipo', asyncRoute(async (req, res) => {
  res.json({ tipo: req.params.tipo, linhas: await reportRows(req.params.tipo, req.query) });
}));

app.post('/api/login', asyncRoute(async (req, res) => {
  res.json({ usuario: await authenticate(req.body.matricula, req.body.senha) });
}));

app.post('/api/usuarios', asyncRoute(async (req, res) => {
  res.status(201).json({ usuario: await saveUser(req.body) });
}));

app.post('/api/perfis', asyncRoute(async (req, res) => {
  res.status(201).json({ perfil: await saveProfile(req.body) });
}));

app.post('/api/perfis/excluir', asyncRoute(async (req, res) => {
  res.json({ perfil: await deleteProfile(req.body.cargo) });
}));

app.post('/api/usuarios/status', asyncRoute(async (req, res) => {
  res.json({ usuario: await setUserStatus(req.body.matricula, req.body.status) });
}));

app.post('/api/lojas', asyncRoute(async (req, res) => {
  res.status(201).json({ loja: await saveStore(req.body) });
}));

app.post('/api/envios', asyncRoute(async (req, res) => {
  res.status(201).json({ envio: await createShipment(req.body) });
}));

app.post('/api/envios/editar', asyncRoute(async (req, res) => {
  res.json({ envio: await updateShipment(req.body) });
}));

app.post('/api/recebimentos', asyncRoute(async (req, res) => {
  res.status(201).json({ recebimento: await createReceipt(req.body) });
}));

app.post('/api/estoque', asyncRoute(async (req, res) => {
  res.json(await updateInventory(req.body));
}));

app.post('/api/ia/envio-taloes/recalcular', asyncRoute(async (_req, res) => {
  res.json(await runAiAnalysis());
}));

app.post('/api/chatbot', asyncRoute(async (req, res) => {
  res.json(await answerChatbot(req.body.pergunta));
}));

app.post('/api/relatorios/enviar', asyncRoute(async (req, res) => {
  res.status(201).json({ relatorio: await submitReport(req.body) });
}));

app.post('/api/relatorios/exportar', asyncRoute(async (req, res) => {
  const rows = await reportRows(req.body.tipo, req.body.filtros || {});
  res.json({
    nome: `${req.body.tipo || 'relatorio'}.csv`,
    csv: toCsv(rows),
  });
}));

app.use(express.static(projectRoot));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ erro: 'Rota nao encontrada.' });
    return;
  }
  res.status(404).send('Arquivo nao encontrado.');
});

app.use((error, _req, res, _next) => {
  const status = error instanceof AppError ? error.status : 500;
  res.status(status).json({ erro: error.message || 'Erro interno do servidor.' });
});

app.listen(port, () => {
  console.log(`Backend Node rodando em http://localhost:${port}`);
  console.log(`Frontend: http://localhost:${port}/login/login.html`);
});
