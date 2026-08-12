const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const {
  authenticate,
  deleteUser,
  getUserByMatricula,
  listUsers,
  saveUser,
  setUserStatus,
} = require('../services');

const router = Router();

router.get('/usuarios', asyncRoute(async (_req, res) => {
  res.json({ usuarios: await listUsers() });
}));

router.get('/usuarios/:matricula', asyncRoute(async (req, res) => {
  res.json({ usuario: await getUserByMatricula(req.params.matricula) });
}));

router.post('/login', asyncRoute(async (req, res) => {
  res.json({ usuario: await authenticate(req.body.matricula, req.body.senha) });
}));

router.post('/usuarios', asyncRoute(async (req, res) => {
  res.status(201).json({ usuario: await saveUser(req.body) });
}));

router.put('/usuarios/:matricula', asyncRoute(async (req, res) => {
  res.json({ usuario: await saveUser({ ...req.body, matricula: req.params.matricula }) });
}));

router.delete('/usuarios/:matricula', asyncRoute(async (req, res) => {
  res.json({ usuario: await deleteUser(req.params.matricula) });
}));

router.post('/usuarios/status', asyncRoute(async (req, res) => {
  res.json({ usuario: await setUserStatus(req.body.matricula, req.body.status) });
}));

module.exports = router;
