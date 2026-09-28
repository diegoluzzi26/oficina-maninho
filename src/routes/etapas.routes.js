'use strict';
const router = require('express').Router();
const svc = require('../services/etapas.service');
const regras = require('../services/etapa-regras.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

// Leitura: qualquer usuário autenticado (o Kanban precisa das colunas).
router.get('/', h(async (_req, res) => res.json(await svc.listar())));

// Escrita: só admin configura as etapas.
router.post('/', requireRole('admin'), validate({ body: v.criarEtapa }),
  h(async (req, res) => res.status(201).json(await svc.criar(req.body))));

router.patch('/reordenar', requireRole('admin'), validate({ body: v.reordenarEtapas }),
  h(async (req, res) => res.json(await svc.reordenar(req.body.ids))));

router.patch('/:id', requireRole('admin'),
  validate({ params: v.idParam, body: v.atualizarEtapa }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.delete('/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.desativar(req.params.id))));

// --- automações da etapa (gatilho → ação) ---
router.get('/:id/regras', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await regras.listar(req.params.id))));

router.post('/:id/regras', requireRole('admin'),
  validate({ params: v.idParam, body: v.criarRegraEtapa }),
  h(async (req, res) => res.status(201).json(await regras.criar(req.params.id, req.body))));

router.patch('/:id/regras/:regraId', requireRole('admin'),
  validate({ params: v.regraParams, body: v.atualizarRegraEtapa }),
  h(async (req, res) => res.json(await regras.atualizar(req.params.regraId, req.body))));

router.delete('/:id/regras/:regraId', requireRole('admin'),
  validate({ params: v.regraParams }),
  h(async (req, res) => { await regras.remover(req.params.regraId); res.status(204).end(); }));

module.exports = router;
