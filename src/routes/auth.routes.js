'use strict';
const router = require('express').Router();
const svc = require('../services/auth.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

router.post('/login', validate({ body: v.login }), h(async (req, res) => {
  res.json(await svc.login(req.body.email, req.body.senha));
}));

router.get('/me', auth, (req, res) => res.json(req.user));

// Só admin cria usuários
router.post('/usuarios', auth, requireRole('admin'), validate({ body: v.criarUsuario }),
  h(async (req, res) => res.status(201).json(await svc.criarUsuario(req.body))));

router.get('/usuarios', auth, requireRole('admin'),
  h(async (_req, res) => res.json(await svc.listarUsuarios())));

module.exports = router;
