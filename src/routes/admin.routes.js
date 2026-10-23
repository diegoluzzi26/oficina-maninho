'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/provisionamento.service');
const assinatura = require('../services/assinatura.service');
const contrato = require('../services/contrato.service');
const asaas = require('../services/asaas.service');
const planos = require('../config/planos');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

/**
 * Rotas da PLATAFORMA (super-admin). Montadas em /api/admin atrás de
 * auth + requireSuperAdmin. NÃO usam oficinaContext: operam sobre o public
 * e provisionam schemas novos.
 */

// Números gerais: receita, oficinas em teste, acessos e visitas do site.
router.get('/resumo', h(async (_req, res) => {
  res.json(await svc.resumoPlataforma());
}));

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
  plano: z.enum(planos.ORDEM).optional(),
  ciclo: z.enum(['mensal', 'anual']).optional(),
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

// --- Cobrança via Asaas (Fase B) ---
// Cria cliente + assinatura recorrente no Asaas pra uma oficina. O status
// passa a ser atualizado pelos webhooks de pagamento.
const cobrancaBody = z.object({
  cpf_cnpj: z.string().min(11).max(18),
  ciclo: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
});

router.post('/oficinas/:id/cobranca', validate({ body: cobrancaBody }), h(async (req, res) => {
  if (!asaas.configurado()) {
    throw new AppError('Asaas não configurado — defina ASAAS_API_KEY no .env', 503);
  }
  const of = (await db.pool.query(
    `SELECT o.id, o.nome, o.plano, o.trial_fim::text AS trial_fim,
            (SELECT u.email FROM users u
              WHERE u.oficina_id = o.id AND u.role = 'admin' AND u.ativo
              ORDER BY u.criado_em LIMIT 1) AS email
       FROM oficinas o WHERE o.id = $1`, [req.params.id])).rows[0];
  if (!of) throw AppError.notFound('Oficina não encontrada');
  if (!of.email) throw new AppError('Oficina sem admin com e-mail pra cobrar', 422);

  const prox = of.trial_fim || new Date().toISOString().slice(0, 10);
  const r = await asaas.criarClienteEAssinatura({
    oficinaId: of.id, nome: of.nome, email: of.email, cpfCnpj: req.body.cpf_cnpj,
    plano: of.plano, ciclo: req.body.ciclo, proximoVencimento: prox,
  });
  res.status(201).json(r);
}));

module.exports = router;
