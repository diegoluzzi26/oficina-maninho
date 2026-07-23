'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/pecas.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

const filtro = z.object({
  busca: z.string().trim().optional(),
  incluir_inativos: z.coerce.boolean().optional(),
});

const atualizarPeca = z.object({
  nome: z.string().min(2).optional(),
  valor_padrao: z.coerce.number().min(0).optional(),
  ativo: z.boolean().optional(),
});

router.get('/', validate({ query: filtro }),
  h(async (req, res) => res.json(await svc.listar(req.query))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

router.put('/:id', requireRole('admin'), validate({ params: v.idParam, body: atualizarPeca }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

module.exports = router;
