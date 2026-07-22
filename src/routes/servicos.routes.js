'use strict';
const router = require('express').Router();
const svc = require('../services/servicos.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

router.get('/', h(async (req, res) => res.json(await svc.listar({
  busca: req.query.busca,
  incluir_inativos: req.query.incluir_inativos === 'true',
}))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

// Preço de catálogo é decisão de dono: só admin mexe
router.post('/', requireRole('admin'), validate({ body: v.criarServico }),
  h(async (req, res) => res.status(201).json(await svc.criar(req.body))));

router.put('/:id', requireRole('admin'), validate({ params: v.idParam, body: v.atualizarServico }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.delete('/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.desativar(req.params.id))));

module.exports = router;
