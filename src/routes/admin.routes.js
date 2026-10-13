'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/provisionamento.service');
const assinatura = require('../services/assinatura.service');
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

// Gestão manual da assinatura (Fase A). Só os campos enviados mudam.
const assinaturaBody = z.object({
  assinatura_status: z.enum(['trial', 'ativa', 'inadimplente', 'cancelada']).optional(),
  plano: z.string().max(60).nullable().optional(),
  trial_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  proximo_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  graca_dias: z.coerce.number().int().min(0).max(90).optional(),
});

router.patch('/oficinas/:id/assinatura',
  validate({ body: assinaturaBody }),
  h(async (req, res) => {
    res.json(await assinatura.atualizar(req.params.id, req.body));
  }));

module.exports = router;
