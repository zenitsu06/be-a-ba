const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { authenticate, currentAuthUser } = require('../services');

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
  res.json({
    enviado: true,
    email: req.body.email || null,
    observacao: 'Fluxo simulado para demonstracao no Insomnia. Envio real por e-mail pode ser integrado depois.',
  });
}));

router.post('/auth/redefinir-senha', asyncRoute(async (_req, res) => {
  res.json({
    redefinida: true,
    observacao: 'Fluxo simulado para demonstracao no Insomnia. Validacao de token pode ser integrada depois.',
  });
}));

module.exports = router;
