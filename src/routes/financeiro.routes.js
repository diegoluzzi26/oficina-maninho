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

router.get('/fluxo-diario', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.fluxoDiario(req.query))));

router.get('/fluxo-semanal', validate({ query: v.periodo }),
  h(async (req, res) => res.json(await fin.fluxoSemanal(req.query))));

// Cards de "hoje" e "esta semana" — sem parâmetros, sempre corrente.
router.get('/fluxo-atual',
  h(async (_req, res) => res.json(await fin.fluxoAtual())));

router.get('/categorias', validate({ query: v.filtroCategorias }),
  h(async (req, res) => res.json(await desp.listarCategorias(req.query))));

router.post('/categorias', validate({ body: v.criarCategoria }),
  h(async (req, res) => res.status(201).json(await desp.criarCategoria(req.body))));

router.patch('/categorias/:id', validate({ params: v.idParam, body: v.atualizarCategoria }),
  h(async (req, res) => res.json(await desp.atualizarCategoria(req.params.id, req.body))));

router.delete('/categorias/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await desp.excluirCategoria(req.params.id))));

module.exports = router;
