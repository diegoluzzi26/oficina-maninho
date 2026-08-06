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

router.post('/fila/enviar-pendentes', requireRole('admin'),
  h(async (req, res) => res.json(await svc.enviarPendentesAgora(req.user.id))));

router.delete('/fila/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => { await svc.removerItem(req.params.id); res.status(204).end(); }));

// ---------------------------------------------------------------- GERAR
router.post('/gerar', requireRole('admin'), validate({ body: v.gerar }),
  h(async (req, res) => res.json(await svc.gerarFila(req.body, req.user.id))));

// ---------------------------------------------------------------- MÉTRICAS
router.get('/metricas', validate({ query: v.periodoMetricas }),
  h(async (req, res) => res.json(await svc.metricas(req.query))));

module.exports = router;
