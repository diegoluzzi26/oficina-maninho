'use strict';
const router = require('express').Router();
const svc = require('../services/despesas.service');
const v = require('../validators/financeiro');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

router.get('/', h(async (req, res) => res.json(await svc.listarFornecedores({
  busca: req.query.busca,
  incluir_inativos: req.query.incluir_inativos === 'true',
}))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarFornecedor(req.params.id))));

router.post('/', validate({ body: v.criarFornecedor }),
  h(async (req, res) => res.status(201).json(await svc.criarFornecedor(req.body))));

router.put('/:id', validate({ params: v.idParam, body: v.atualizarFornecedor }),
  h(async (req, res) => res.json(await svc.atualizarFornecedor(req.params.id, req.body))));

router.delete('/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.desativarFornecedor(req.params.id))));

module.exports = router;
