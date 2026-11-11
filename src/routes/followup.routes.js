'use strict';
const router = require('express').Router();
const svc = require('../services/followup.service');
const v = require('../validators/followup');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

// ---------------------------------------------------------------- REGRAS
router.get('/regras', validate({ query: v.filtroRegras }),
  h(async (req, res) => res.json(await svc.listarRegras(req.query))));

router.post('/regras', requireRole('admin'), validate({ body: v.regra }),
  h(async (req, res) => res.status(201).json(await svc.criarRegra(req.body))));

router.put('/regras/:id', requireRole('admin'),
  validate({ params: v.idParam, body: v.atualizarRegra }),
  h(async (req, res) => res.json(await svc.atualizarRegra(req.params.id, req.body))));

router.delete('/regras/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.removerRegra(req.params.id))));

// ---------------------------------------------------------------- FILA
router.get('/fila', validate({ query: v.filtroFila }),
  h(async (req, res) => res.json(await svc.listarFila(req.query))));

// Antes de /fila/:id, senão o Express trata "envio-lote" como id.
router.get('/fila/envio-lote',
  h(async (req, res) => res.json(svc.estadoLote())));

router.get('/fila/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarItem(req.params.id))));

router.post('/fila/manual', validate({ body: v.criarManual }),
  h(async (req, res) => res.status(201).json(await svc.criarManual(req.body, req.user.id))));

router.patch('/fila/:id/status',
  validate({ params: v.idParam, body: v.mudarStatus }),
  h(async (req, res) => res.json(await svc.mudarStatus(req.params.id, req.body, req.user.id))));

router.patch('/fila/:id/reagendar',
  validate({ params: v.idParam, body: v.reagendar }),
  h(async (req, res) => res.json(await svc.reagendar(req.params.id, req.body, req.user.id))));

// Envio automático via Evolution API (não precisa abrir o WhatsApp)
router.post('/fila/:id/enviar', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.enviarAgora(req.params.id, req.user.id))));

// Lote roda em segundo plano: responde 202 na hora e a tela acompanha
// pelo GET /fila/envio-lote.
router.post('/fila/enviar-pendentes', requireRole('admin'),
  validate({ body: v.enviarPendentes }),
  h(async (req, res) => res.status(202).json(await svc.enviarPendentesAgora(req.user.id, req.body))));

// Confere na Evolution quais pendentes já saíram e marca como enviados.
router.post('/fila/conferir-envios', requireRole('admin'),
  validate({ body: v.conferirEnvios }),
  h(async (req, res) => res.json(await svc.conferirEnvios(req.body, req.user.id))));

router.delete('/fila/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => { await svc.removerItem(req.params.id); res.status(204).end(); }));

// ---------------------------------------------------------------- GERAR
router.post('/gerar', requireRole('admin'), validate({ body: v.gerar }),
  h(async (req, res) => res.json(await svc.gerarFila(req.body, req.user.id))));

// ---------------------------------------------------------------- AUTOMAÇÕES
const { z } = require('zod');

router.get('/automacoes',
  h(async (req, res) => res.json(await svc.listarAutomacoes())));

router.post('/automacoes', requireRole('admin'), validate({ body: v.criarAutomacao }),
  h(async (req, res) => res.status(201).json(await svc.criarAutomacao(req.body))));

// :ref = chave de cartão fixo (revisao, ...) ou id de automação própria.
router.put('/automacoes/:ref', requireRole('admin'),
  validate({ params: v.refAutomacao, body: v.atualizarAutomacao }),
  h(async (req, res) => res.json(await svc.atualizarAutomacao(req.params.ref, req.body))));

// Só automação própria; cartões fixos não se apagam (se desligam).
router.delete('/automacoes/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.removerAutomacao(req.params.id))));

// Campanha: confirmar=false só conta o público; true cria os itens na fila.
router.post('/campanha', requireRole('admin'), validate({ body: v.campanha }),
  h(async (req, res) => res.json(await svc.montarCampanha(req.body, req.user.id))));

// ---------------------------------------------------------------- MÉTRICAS
router.get('/metricas', validate({ query: v.periodoMetricas }),
  h(async (req, res) => res.json(await svc.metricas(req.query))));

router.get('/resultados', validate({ query: v.resultados }),
  h(async (req, res) => res.json(await svc.resultados(req.query))));

// ---------------------------------------------------------------- KANBAN
router.get('/kanban',
  validate({ query: z.object({
    tipo: z.enum(['manutencao','reativacao','promocao','avaliacao']).optional(),
    busca: z.string().optional(),
  }) }),
  h(async (req, res) => res.json(await svc.kanban(req.query))));

router.get('/historico/:cliente_id',
  validate({ params: z.object({ cliente_id: z.string().uuid() }) }),
  h(async (req, res) => res.json(await svc.historicoDoCliente(req.params.cliente_id))));

module.exports = router;
