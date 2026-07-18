const { Router } = require('express');
const asyncRoute = require('../middlewares/async-route');
const {
  linkUserProfile,
  listUserProfiles,
  listUserProfilesByMatricula,
  unlinkUserProfile,
} = require('../services');

const router = Router();

router.get('/usuarios-perfis', asyncRoute(async (_req, res) => {
  res.json({ vinculos: await listUserProfiles() });
}));

router.get('/usuarios-perfis/:matricula', asyncRoute(async (req, res) => {
  res.json({ vinculos: await listUserProfilesByMatricula(req.params.matricula) });
}));

router.post('/usuarios-perfis', asyncRoute(async (req, res) => {
  res.status(201).json({ vinculo: await linkUserProfile(req.body) });
}));

router.delete('/usuarios-perfis/:matricula/:idPerfil', asyncRoute(async (req, res) => {
  res.json({ vinculo: await unlinkUserProfile(req.params.matricula, req.params.idPerfil) });
}));

module.exports = router;
