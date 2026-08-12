const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const { deleteProfile, deleteProfileById, getProfileById, listProfiles, saveProfile } = require('../services');

const router = Router();

router.get('/perfis', asyncRoute(async (_req, res) => {
  res.json({ perfis: await listProfiles() });
}));

router.get('/perfis/:id', asyncRoute(async (req, res) => {
  res.json({ perfil: await getProfileById(req.params.id) });
}));

router.post('/perfis', asyncRoute(async (req, res) => {
  res.status(201).json({ perfil: await saveProfile(req.body) });
}));

router.put('/perfis/:id', asyncRoute(async (req, res) => {
  const atual = await getProfileById(req.params.id);
  res.json({ perfil: await saveProfile({ ...req.body, cargo: atual.cargo }) });
}));

router.delete('/perfis/:id', asyncRoute(async (req, res) => {
  res.json({ perfil: await deleteProfileById(req.params.id) });
}));

router.post('/perfis/excluir', asyncRoute(async (req, res) => {
  res.json({ perfil: await deleteProfile(req.body.cargo) });
}));

module.exports = router;
