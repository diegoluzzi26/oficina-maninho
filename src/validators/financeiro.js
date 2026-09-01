'use strict';
const { z } = require('zod');
const { toE164 } = require('../utils/phone');

const uuid = z.string().uuid('Identificador inválido');
const dinheiro = z.coerce.number().positive('Valor deve ser maior que zero');
const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');

const telefoneOpc = z.string().transform((v, ctx) => {
  if (!v) return null;
  try { return toE164(v); } catch (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err.message });
    return z.NEVER;
  }
}).nullable().optional();

const FORMAS = ['dinheiro', 'pix', 'boleto', 'cartao_credito',
  'cartao_debito', 'transferencia', 'cheque', 'outro'];

const criarFornecedor = z.object({
  nome: z.string().min(2, 'Nome muito curto'),
  cnpj_cpf: z.string().trim().optional().nullable(),
  telefone: telefoneOpc,
  email: z.string().email('E-mail inválido').optional().nullable().or(z.literal('')),
  endereco: z.string().optional().nullable(),
  contato: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

const criarDespesa = z.object({
  descricao: z.string().min(2, 'Descrição muito curta'),
  categoria_id: uuid.optional().nullable(),
  fornecedor_id: uuid.optional().nullable(),
  valor: dinheiro,
  forma: z.enum(FORMAS).default('boleto'),
  vencimento: dataISO.optional().nullable().or(z.literal('').transform(() => null)),
  competencia: dataISO.optional().nullable().or(z.literal('').transform(() => null)),
  status: z.enum(['pendente', 'paga', 'atrasada']).default('pendente'),
  pago_em: dataISO.optional().nullable().or(z.literal('').transform(() => null)),
  valor_pago: z.coerce.number().min(0).optional().nullable(),
  codigo_barras: z.string().optional().nullable(),
  numero_doc: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  recorrente: z.boolean().default(false),
  escopo: z.enum(['oficina', 'pessoal']).default('oficina'),
});

const atualizarDespesa = criarDespesa.partial();

const pagar = z.object({
  pago_em: dataISO.optional().nullable(),
  valor_pago: z.coerce.number().min(0).optional().nullable(),
});

const filtroDespesas = z.object({
  escopo: z.enum(['oficina', 'pessoal']).optional(),
  status: z.enum(['pendente', 'paga', 'atrasada', 'cancelada']).optional(),
  categoria_id: uuid.optional(),
  fornecedor_id: uuid.optional(),
  forma: z.enum(FORMAS).optional(),
  somente_boletos: z.coerce.boolean().optional(),
  inicio: dataISO.optional(),
  fim: dataISO.optional(),
  vence_ate: dataISO.optional(),
  busca: z.string().trim().optional(),
  pagina: z.coerce.number().int().positive().default(1),
  por_pagina: z.coerce.number().int().positive().max(2000).default(50),
});

const periodo = z.object({
  inicio: dataISO.optional(),
  fim: dataISO.optional(),
  limite: z.coerce.number().int().positive().max(50).default(10),
  escopo: z.enum(['oficina', 'pessoal', 'ambos']).default('oficina'),
}).refine((v) => !v.inicio || !v.fim || v.inicio <= v.fim, {
  message: 'Data inicial não pode ser maior que a final',
});

const ESCOPOS_CATEGORIA = ['oficina', 'pessoal', 'ambos'];

const criarCategoria = z.object({
  nome: z.string().min(2),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser hexadecimal, ex: #2B3D8F').optional(),
  escopo: z.enum(ESCOPOS_CATEGORIA).default('ambos'),
  ordem: z.coerce.number().int().min(0).max(9999).optional(),
});

const atualizarCategoria = z.object({
  nome: z.string().min(2).optional(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser hexadecimal, ex: #2B3D8F').optional(),
  escopo: z.enum(ESCOPOS_CATEGORIA).optional(),
  ordem: z.coerce.number().int().min(0).max(9999).optional(),
  ativo: z.boolean().optional(),
});

const filtroCategorias = z.object({
  escopo: z.enum(['oficina', 'pessoal']).optional(),
  incluir_inativas: z.coerce.boolean().optional(),
});

module.exports = {
  criarFornecedor,
  atualizarFornecedor: criarFornecedor.partial(),
  criarDespesa, atualizarDespesa, pagar, filtroDespesas, periodo,
  criarCategoria, atualizarCategoria, filtroCategorias,
  idParam: z.object({ id: uuid }),
};
