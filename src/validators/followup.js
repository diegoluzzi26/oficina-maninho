'use strict';
const { z } = require('zod');

const uuid = z.string().uuid('ID inválido');

const tipo   = z.enum(['manutencao', 'reativacao', 'promocao']);
const status = z.enum(['pendente', 'enviado', 'respondeu', 'converteu', 'dispensado']);

const regra = z.object({
  nome: z.string().min(3).max(120),
  tipo,
  servico_id: uuid.nullable().optional(),
  intervalo_dias: z.coerce.number().int().min(7).max(730).optional(),
  mensagem_template: z.string().min(10).max(2000),
  ativo: z.boolean().optional(),
});
const atualizarRegra = regra.partial();

const criarManual = z.object({
  cliente_id: uuid,
  carro_id: uuid.nullable().optional(),
  tipo,
  mensagem: z.string().min(10).max(2000),
  agendado_para: z.string().date().optional(),
  notas: z.string().max(500).optional(),
});

const mudarStatus = z.object({
  status: z.enum(['enviado', 'respondeu', 'converteu', 'dispensado', 'pendente']),
  notas: z.string().max(500).optional(),
  os_id: uuid.optional(),
});

const reagendar = z.object({
  agendado_para: z.string().date(),
  notas: z.string().max(500).optional(),
});

const gerar = z.object({
  regra_id: uuid.optional(),
});

const filtroFila = z.object({
  status: status.optional(),
  tipo: tipo.optional(),
  de: z.string().date().optional(),
  ate: z.string().date().optional(),
  busca: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(100).default(30),
});

const filtroRegras = z.object({
  ativo: z.enum(['true', 'false']).optional().transform((v) => v === undefined ? undefined : v === 'true'),
});

const idParam = z.object({ id: uuid });
const periodoMetricas = z.object({ periodo: z.coerce.number().int().min(1).max(730).default(30) });

module.exports = {
  regra, atualizarRegra, criarManual, mudarStatus, reagendar, gerar,
  filtroFila, filtroRegras, idParam, periodoMetricas,
};
