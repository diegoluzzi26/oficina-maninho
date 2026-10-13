'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/provisionamento.service');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

/**
 * Rotas da PLATAFORMA (super-admin). Montadas em /api/admin atrás de
 * auth + requireSuperAdmin. NÃO usam oficinaContext: operam sobre o public
 * e provisionam schemas novos.
 */

router.get('/oficinas', h(async (_req, res) => {
  res.json(await svc.listarOficinas());
}));

const criarBody = z.object({
  slug: z.string().min(3).max(31),
  nome: z.string().min(1).max(120),
  admin: z.object({
    nome: z.string().min(1).max(120),
    email: z.string().email(),
    senha: z.string().min(8).max(100),
  }),
});

router.post('/oficinas', validate({ body: criarBody }), h(async (req, res) => {
  const oficina = await svc.criarOficina(req.body);
  res.status(201).json(oficina);
}));

module.exports = router;
