'use strict';
const router = require('express').Router();
const svc = require('../services/clientes.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

router.get('/', validate({ query: v.paginacao }),
  h(async (req, res) => res.json(await svc.listar(req.query))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

router.post('/', validate({ body: v.criarCliente }),
  h(async (req, res) => res.status(201).json(await svc.criar(req.body))));

router.put('/:id', validate({ params: v.idParam, body: v.atualizarCliente }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.delete('/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => { await svc.remover(req.params.id); res.status(204).end(); }));

module.exports = router;
