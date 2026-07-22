'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/retornos.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

const filtro = z.object({
  status: z.enum(['pendente', 'contatado', 'ignorado']).optional(),
  cliente_id: v.uuid.optional(),
  ate_dias: z.coerce.number().int().min(0).max(365).optional(),
  busca: z.string().trim().optional(),
});

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD');

const criarRetorno = z.object({
  cliente_id: v.uuid,
  carro_id: v.uuid.optional().nullable(),
  os_id: v.uuid.optional().nullable(),
  servico_id: v.uuid.optional().nullable(),
  nome_servico: z.string().min(1).optional().nullable(),
  agendado_para: dataISO,
  motivo: z.string().optional().nullable(),
});

const atualizarRetorno = z.object({
  agendado_para: dataISO.optional(),
  motivo: z.string().optional().nullable(),
  nome_servico: z.string().optional().nullable(),
  status: z.enum(['pendente', 'contatado', 'ignorado']).optional(),
});

router.get('/', validate({ query: filtro }),
  h(async (req, res) => res.json(await svc.listar(req.query))));

router.get('/do-mes',
  validate({ query: z.object({ ano: z.coerce.number().int().optional(),
                               mes: z.coerce.number().int().min(1).max(12).optional() }) }),
  h(async (req, res) => res.json(await svc.doMes(req.query))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

router.post('/', validate({ body: criarRetorno }),
  h(async (req, res) => res.status(201).json(await svc.criar(req.body))));

router.put('/:id', validate({ params: v.idParam, body: atualizarRetorno }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.patch('/:id/contatado', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.marcarContatado(req.params.id))));

router.patch('/:id/ignorar', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.ignorar(req.params.id))));

router.delete('/:id', validate({ params: v.idParam }),
  h(async (req, res) => { await svc.remover(req.params.id); res.status(204).end(); }));

module.exports = router;
