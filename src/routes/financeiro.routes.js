'use strict';
const router = require('express').Router();
const { z } = require('zod');
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

// OSs pagas em um dia específico (default: hoje). Data em YYYY-MM-DD.
router.get('/os-do-dia',
  validate({ query: z.object({ data: z.string().date().optional() }) }),
  h(async (req, res) => res.json(await fin.osDoDia(req.query))));

// TODAS as OSs pagas de um mês, agrupadas por dia. Sem paginação.
router.get('/os-do-mes',
  validate({ query: z.object({
    ano: z.coerce.number().int().min(2000).max(2100).optional(),
    mes: z.coerce.number().int().min(1).max(12).optional(),
  }) }),
  h(async (req, res) => res.json(await fin.osDoMes(req.query))));

router.get('/categorias', validate({ query: v.filtroCategorias }),
  h(async (req, res) => res.json(await desp.listarCategorias(req.query))));

router.post('/categorias', validate({ body: v.criarCategoria }),
  h(async (req, res) => res.status(201).json(await desp.criarCategoria(req.body))));

router.patch('/categorias/:id', validate({ params: v.idParam, body: v.atualizarCategoria }),
  h(async (req, res) => res.json(await desp.atualizarCategoria(req.params.id, req.body))));

router.delete('/categorias/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await desp.excluirCategoria(req.params.id))));

module.exports = router;
