'use strict';
const router = require('express').Router();
const fin = require('../services/financeiro.service');
const desp = require('../services/despesas.service');
const v = require('../validators/financeiro');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

router.get('/painel', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.painelFinanceiro(req.query))));

router.get('/resumo', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.resumo(req.query))));

router.get('/por-categoria', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.porCategoria(req.query))));

router.get('/por-forma', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.porFormaPagamento(req.query))));

router.get('/por-fornecedor', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.porFornecedor(req.query))));

router.get('/evolucao', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.evolucaoMensal(req.query))));

router.get('/fluxo-caixa', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.fluxoCaixa(req.query))));

router.get('/categorias', h(async (_req, res) => res.json(await desp.listarCategorias())));

router.post('/categorias', validate({ body: v.criarCategoria }),
  h(async (req, res) => res.status(201).json(await desp.criarCategoria(req.body))));

module.exports = router;
