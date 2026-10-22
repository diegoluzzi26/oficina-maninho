'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/provisionamento.service');
const assinatura = require('../services/assinatura.service');
const contrato = require('../services/contrato.service');
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

// --- Contrato / Termos de uso (super-admin edita o texto) ---
router.get('/contratos', h(async (_req, res) => {
  res.json({ atual: await contrato.versaoAtual(), versoes: await contrato.listarVersoes() });
}));

const contratoBody = z.object({
  titulo: z.string().min(1).max(160),
  texto: z.string().min(1).max(50000),
});

// Publicar versão nova (incrementa o número; obriga re-aceite geral).
router.post('/contratos', validate({ body: contratoBody }), h(async (req, res) => {
  res.status(201).json(await contrato.publicarVersao(req.body));
}));

module.exports = router;
