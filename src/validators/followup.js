'use strict';
const { z } = require('zod');

const uuid = z.string().uuid('ID inválido');

const tipo   = z.enum(['manutencao', 'reativacao', 'promocao', 'avaliacao']);
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

const chaveAutomacao = z.enum(['revisao', 'pos_servico', 'reativacao', 'campanha']);

const gerar = z.object({
  chave: chaveAutomacao.optional(),
  id: uuid.optional(),
});

const gatilho = z.enum(['servico_feito', 'sumido', 'aniversario', 'campanha']);

const filtrosAutomacao = z.object({
  servico_ids: z.array(uuid).max(50).optional(),
  peca_ids: z.array(uuid).max(50).optional(),
  marca: z.string().trim().max(60).optional(),
  modelo: z.string().trim().max(60).optional(),
  ano_min: z.coerce.number().int().min(1950).max(2100).optional().nullable(),
  ano_max: z.coerce.number().int().min(1950).max(2100).optional().nullable(),
  cambios: z.array(z.enum(['manual', 'automatico', 'cvt', 'automatizado'])).max(4).optional(),
  visita: z.enum(['qualquer', 'recente', 'sumido']).optional(),
  visita_dias: z.coerce.number().int().min(1).max(3650).optional(),
});

const mensagemTemplate = z.string().trim().min(10, 'Mensagem muito curta').max(2000);

const atualizarAutomacao = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à automação').max(60).optional(),
  ativo: z.boolean().optional(),
  envio_automatico: z.boolean().optional(),
  intervalo_dias: z.coerce.number().int().min(1).max(3650).optional(),
  antecedencia_dias: z.coerce.number().int().min(0).max(120).optional(),
  mensagem_template: mensagemTemplate.optional(),
  filtros: filtrosAutomacao.optional(),
});

const criarAutomacao = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à automação').max(60),
  gatilho,
  intervalo_dias: z.coerce.number().int().min(1).max(3650).default(30),
  mensagem_template: mensagemTemplate,
  filtros: filtrosAutomacao.default({}),
  ativo: z.boolean().default(true),
  envio_automatico: z.boolean().default(false),
});

// Cartão fixo pela chave ou automação própria pelo id.
const refAutomacao = z.object({ ref: z.union([chaveAutomacao, uuid]) });

const campanha = z.object({
  mensagem: z.string().max(2000).optional(),
  confirmar: z.boolean().optional(),
  regra_id: uuid.optional(),
});

const resultados = z.object({
  meses: z.coerce.number().int().min(1).max(24).optional(),
});

// Envio em lote: lista opcional de ids e/ou regra_id. Sem nenhum = todos os
// pendentes até hoje (comportamento antigo). Com ids = só os selecionados; com
// regra_id = só os daquela regra. Ambos ainda passam pela trava de "pendente
// até hoje" no serviço.
const enviarPendentes = z.object({
  ids: z.array(uuid).max(100).optional(),
  regra_id: uuid.optional(),
});

const acaoEmLote = z.object({
  ids: z.array(uuid).min(1, 'Selecione ao menos um').max(500),
  acao: z.enum(['excluir', 'dispensar']),
});

const conferirEnvios = z.object({
  todosPendentes: z.boolean().optional(),
});

const filtroFila = z.object({
  status: status.optional(),
  tipo: tipo.optional(),
  regra_id: uuid.optional(),
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
  chaveAutomacao, atualizarAutomacao, criarAutomacao, refAutomacao, campanha, resultados,
  enviarPendentes, conferirEnvios, acaoEmLote, filtroFila, filtroRegras, idParam, periodoMetricas,
};
