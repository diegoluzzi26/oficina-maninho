'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/agendamentos.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

const itemAgendamento = z.object({
  servico_id: v.uuid.optional().nullable(),
  nome_servico: z.string().min(1).optional(),
}).refine((x) => x.servico_id || x.nome_servico,
  { message: 'Informe servico_id ou nome_servico' });

// Reusa os schemas inline já definidos em validators/schemas.js para OS —
// mesmo formato de cliente/carro novo, mesmas regras de telefone/placa.
const clienteInline = z.object({
  nome: z.string().min(2),
  telefone: v.telefone,
  cpf_cnpj: z.string().trim().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  endereco: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});
const carroInline = z.object({
  placa: v.placa,
  marca: z.string().min(1),
  modelo: z.string().min(1),
  ano: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  cor: z.string().optional().nullable(),
  km_atual: z.coerce.number().int().min(0).optional().nullable(),
  chassi: z.string().trim().length(17).optional().nullable().or(z.literal('').transform(() => null)),
});

const criar = z.object({
  cliente_id: v.uuid.optional(),
  carro_id: v.uuid.optional(),
  novo_cliente: clienteInline.optional(),
  novo_carro: carroInline.optional(),
  data_agendada: z.string().datetime().or(
    z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/), // aceita input datetime-local
  ),
  duracao_min: z.coerce.number().int().min(5).max(720).default(60),
  observacoes: z.string().optional().nullable(),
  servicos: z.array(itemAgendamento).default([]),
})
  .refine((v) => v.cliente_id || v.novo_cliente,
    { message: 'Informe cliente_id ou novo_cliente', path: ['cliente_id'] })
  .refine((v) => v.carro_id || v.novo_carro,
    { message: 'Informe carro_id ou novo_carro', path: ['carro_id'] });

const atualizar = z.object({
  cliente_id: v.uuid.optional(),
  carro_id: v.uuid.optional(),
  data_agendada: z.string().datetime().or(
    z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/),
  ).optional(),
  duracao_min: z.coerce.number().int().min(5).max(720).optional(),
  observacoes: z.string().optional().nullable(),
  status: z.enum(['agendado', 'concluido', 'cancelado']).optional(),
  servicos: z.array(itemAgendamento).optional(),
});

const filtroMes = z.object({
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  status: z.enum(['agendado', 'concluido', 'cancelado']).optional(),
});

const filtroDia = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD'),
  status: z.enum(['agendado', 'concluido', 'cancelado']).optional(),
});

const converter = z.object({
  km_entrada: z.coerce.number().int().min(0).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  desconto: z.coerce.number().min(0).optional(),
});

router.get('/', validate({ query: filtroMes }),
  h(async (req, res) => res.json(await svc.listarPorMes(req.query))));

router.get('/dia', validate({ query: filtroDia }),
  h(async (req, res) => res.json(await svc.listarPorDia(req.query.data, { status: req.query.status }))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

router.post('/', validate({ body: criar }),
  h(async (req, res) => res.status(201).json(await svc.criar(req.body, req.user.id))));

router.put('/:id', validate({ params: v.idParam, body: atualizar }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.patch('/:id/cancelar', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.cancelar(req.params.id))));

router.delete('/:id', validate({ params: v.idParam }),
  h(async (req, res) => { await svc.remover(req.params.id); res.status(204).end(); }));

router.post('/:id/converter-os', validate({ params: v.idParam, body: converter }),
  h(async (req, res) => res.status(201).json(await svc.converterEmOS(req.params.id, req.body, req.user.id))));

module.exports = router;
