'use strict';
const router = require('express').Router();
const svc = require('../services/auth.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

router.post('/login', validate({ body: v.login }), h(async (req, res) => {
  res.json(await svc.login(req.body.email, req.body.senha, req.body.oficina_slug));
}));

router.get('/me', auth, (req, res) => res.json(req.user));

// Só admin cria usuários — sempre dentro da própria oficina
router.post('/usuarios', auth, requireRole('admin'), validate({ body: v.criarUsuario }),
  h(async (req, res) => res.status(201).json(
    await svc.criarUsuario(req.body, req.user.oficina_id))));

router.get('/usuarios', auth, requireRole('admin'),
  h(async (req, res) => res.json(await svc.listarUsuarios(req.user.oficina_id))));

module.exports = router;
