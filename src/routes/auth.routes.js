'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/auth.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const AppError = require('../utils/AppError');
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

// Editar usuário da própria oficina. Guarda: admin não se auto-desativa
// nem se auto-rebaixa (evita lock-out da oficina).
const atualizarUsuarioBody = z.object({
  nome: z.string().min(1).max(120).optional(),
  role: z.enum(['admin', 'atendente', 'basico']).optional(),
  ativo: z.boolean().optional(),
  senha: z.string().min(8).max(100).optional(),
});

router.patch('/usuarios/:id', auth, requireRole('admin'),
  validate({ body: atualizarUsuarioBody }),
  h(async (req, res) => {
    if (req.params.id === req.user.id) {
      if (req.body.ativo === false) {
        throw new AppError('Você não pode desativar o próprio usuário', 422);
      }
      if (req.body.role && req.body.role !== 'admin') {
        throw new AppError('Você não pode rebaixar o próprio acesso de admin', 422);
      }
    }
    res.json(await svc.atualizarUsuario(req.params.id, req.body, req.user.oficina_id));
  }));

module.exports = router;
