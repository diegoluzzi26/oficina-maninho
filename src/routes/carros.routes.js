'use strict';
const router = require('express').Router();
const svc = require('../services/carros.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');
const placaSvc = require('../services/placa.service');

router.get('/', h(async (req, res) => res.json(await svc.listar(req.query))));

// Consulta externa (API Placas) pra preencher o formulário; não grava nada.
// Precisa vir antes de '/:id'.
router.get('/placa/status', (req, res) => res.json({ ativo: placaSvc.ativo() }));
router.get('/placa/:placa', h(async (req, res) => res.json(await placaSvc.consultar(req.params.placa))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

router.get('/:id/historico', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.historico(req.params.id))));

router.post('/', validate({ body: v.criarCarro }),
  h(async (req, res) => res.status(201).json(await svc.criar(req.body))));

router.put('/:id', validate({ params: v.idParam, body: v.atualizarCarro }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.delete('/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => { await svc.remover(req.params.id); res.status(204).end(); }));

module.exports = router;
