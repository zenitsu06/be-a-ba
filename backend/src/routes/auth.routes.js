const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const {
  authenticate,
  currentAuthUser,
  redefineUserPassword,
  requestPasswordRecovery,
} = require('../services');

const router = Router();

router.post('/auth/login', asyncRoute(async (req, res) => {
  const usuario = await authenticate(req.body.matricula, req.body.senha);
  res.json({
    usuario,
    token: 'jwt-ainda-nao-configurado',
    observacao: 'Endpoint criado para o modulo Auth/Login. JWT real sera ativado quando JWT_SECRET for configurado.',
  });
}));

router.post('/auth/logout', asyncRoute(async (_req, res) => {
  res.json({ logout: true });
}));

router.get('/auth/me', asyncRoute(async (_req, res) => {
  res.json(await currentAuthUser());
}));

router.post('/auth/recuperar-senha', asyncRoute(async (req, res) => {
  res.json(await requestPasswordRecovery(req.body.email, req.body.matricula));
}));

router.post('/auth/redefinir-senha', asyncRoute(async (req, res) => {
  res.json(await redefineUserPassword(req.body.matricula, req.body.nova_senha || req.body.senha));
}));

module.exports = router;
