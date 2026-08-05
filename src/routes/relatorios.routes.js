'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/relatorios.service');
const agendado = require('../services/relatorio-agendado.service');
const requireRole = require('../middleware/requireRole');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

router.get('/painel-mes',
  validate({ query: z.object({
    ano: z.coerce.number().int().min(2000).max(2100).optional(),
    mes: z.coerce.number().int().min(1).max(12).optional(),
  }) }),
  h(async (req, res) => res.json(await svc.painelMes(req.query))));

router.get('/resumo', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await svc.resumo(req.query))));

router.get('/faturamento', validate({ query: v.periodo }),
  h(async (req, res) => res.json(
    await svc.faturamentoPorPeriodo(req.query, req.query.granularidade === 'week' ? 'week' : 'month'),
  )));

router.get('/faturamento/semanal', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await svc.faturamentoPorPeriodo(req.query, 'week'))));

router.get('/servicos-mais-vendidos', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await svc.servicosMaisVendidos(req.query))));

router.get('/clientes-recorrentes', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await svc.clientesRecorrentes(req.query))));

router.get('/comparativo-mensal',
  h(async (_req, res) => res.json(await svc.comparativoMensal())));

/** Payload único para o dashboard: evita 5 chamadas do frontend no load. */
router.get('/dashboard', validate({ query: v.periodo }), h(async (req, res) => {
  const [resumo, faturamento, servicos, recorrentes, comparativo] = await Promise.all([
    svc.resumo(req.query),
    svc.faturamentoPorPeriodo(req.query, 'month'),
    svc.servicosMaisVendidos(req.query),
    svc.clientesRecorrentes(req.query),
    svc.comparativoMensal(),
  ]);
  res.json({ resumo, faturamento, servicos_mais_vendidos: servicos, clientes_recorrentes: recorrentes, comparativo });
}));

/**
 * Envio manual dos relatórios por WhatsApp (dispara na hora).
 * Só admin. Sempre envia o último período fechado (mês passado / semana passada).
 */
router.post('/enviar-mensal', requireRole('admin'),
  h(async (_req, res) => res.json(await agendado.enviarMensalUltimo())));

router.post('/enviar-semanal', requireRole('admin'),
  h(async (_req, res) => res.json(await agendado.enviarSemanalUltimo())));

module.exports = router;
