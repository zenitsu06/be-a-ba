const { Router } = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const usuariosRoutes = require('./usuarios.routes');
const perfisRoutes = require('./perfis.routes');
const usuariosPerfisRoutes = require('./usuarios-perfis.routes');
const lojasRoutes = require('./lojas.routes');
const estoqueRoutes = require('./estoque.routes');
const enviosRoutes = require('./envios.routes');
const recebimentosRoutes = require('./recebimentos.routes');
const historicoRoutes = require('./historico.routes');
const manutencoesRoutes = require('./manutencoes.routes');
const dashboardRoutes = require('./dashboard.routes');
const iaRoutes = require('./ia.routes');
const relatoriosRoutes = require('./relatorios.routes');

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(usuariosRoutes);
router.use(perfisRoutes);
router.use(usuariosPerfisRoutes);
router.use(lojasRoutes);
router.use(estoqueRoutes);
router.use(enviosRoutes);
router.use(recebimentosRoutes);
router.use(historicoRoutes);
router.use(manutencoesRoutes);
router.use(dashboardRoutes);
router.use(iaRoutes);
router.use(relatoriosRoutes);

module.exports = router;
