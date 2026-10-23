'use strict';
const router = require('express').Router();
const multer = require('multer');
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

// Identidade visual da própria oficina (qualquer usuário logado lê:
// sidebar e impressão da OS usam logo e cores).
router.get('/oficina', auth,
  h(async (req, res) => res.json(await svc.identidadeOficina(req.user.oficina_id))));

// Editar dados da própria oficina: nome e cores. Cor null = volta ao padrão.
const corHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #rrggbb)').nullable();
router.patch('/oficina', auth, requireRole('admin'),
  validate({ body: z.object({
    nome: z.string().min(1).max(120).optional(),
    cor_primaria: corHex.optional(),
    cor_secundaria: corHex.optional(),
  }) }),
  h(async (req, res) => {
    res.json(await svc.atualizarMinhaOficina(req.user.oficina_id, req.body));
  }));

// Logo da oficina: imagem pequena, guardada no banco (public.oficinas).
// SVG fica de fora de propósito: é servido sem login e pode carregar script.
const MIMES_LOGO = new Set(['image/png', 'image/jpeg', 'image/webp']);
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!MIMES_LOGO.has(file.mimetype)) {
      return cb(new AppError(`A logo precisa ser PNG, JPG ou WebP (recebi ${file.mimetype})`, 415));
    }
    cb(null, true);
  },
});

function erroUploadLogo(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('A logo precisa ter no máximo 1 MB', 413));
    return next(new AppError(`Falha no upload: ${err.message}`, 400));
  }
  next(err);
}

router.post('/oficina/logo', auth, requireRole('admin'),
  uploadLogo.single('arquivo'), erroUploadLogo,
  h(async (req, res) => {
    if (!req.file) throw new AppError('Envie a imagem no campo "arquivo"', 400);
    res.json(await svc.salvarLogoOficina(req.user.oficina_id, req.file));
  }));

router.delete('/oficina/logo', auth, requireRole('admin'),
  h(async (req, res) => res.json(await svc.removerLogoOficina(req.user.oficina_id))));

module.exports = router;
