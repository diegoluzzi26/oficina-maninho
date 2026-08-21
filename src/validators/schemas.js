'use strict';
const { z } = require('zod');
const { toE164 } = require('../utils/phone');

const uuid = z.string().uuid('Identificador inválido');

/** Telefone é normalizado durante a validação, já sai em E.164. */
const telefone = z.string().transform((v, ctx) => {
  try {
    return toE164(v);
  } catch (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err.message });
    return z.NEVER;
  }
});

const dinheiro = z.coerce.number().min(0, 'Valor não pode ser negativo').multipleOf(
  0.01, 'Use no máximo 2 casas decimais',
);

// Placa: aceita padrão antigo (ABC1234) e Mercosul (ABC1D23)
const placa = z.string()
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .refine((v) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(v), 'Placa inválida (ex: ABC1D23)');

// ----- auth -----
const login = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha é obrigatória'),
  // Opcional: se não vier, o backend tenta única oficina do email
  oficina_slug: z.string().regex(/^[a-z0-9_]+$/).optional(),
});

const criarUsuario = z.object({
  nome: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  role: z.enum(['admin', 'atendente', 'basico']).default('atendente'),
  oficina_id: z.string().uuid().optional(),
});

// ----- clientes -----
const criarCliente = z.object({
  nome: z.string().min(2, 'Nome muito curto'),
  telefone,
  cpf_cnpj: z.string().trim().min(11).max(18).optional().nullable(),
  email: z.string().email('E-mail inválido').optional().nullable().or(z.literal('')),
  endereco: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});
const atualizarCliente = criarCliente.partial();

// ----- carros -----
const criarCarro = z.object({
  cliente_id: uuid,
  placa,
  marca: z.string().min(1, 'Marca é obrigatória'),
  modelo: z.string().min(1, 'Modelo é obrigatório'),
  ano: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  cor: z.string().optional().nullable(),
  km_atual: z.coerce.number().int().min(0, 'KM não pode ser negativo').optional().nullable(),
  chassi: z.string().trim().length(17, 'Chassi deve ter 17 caracteres').optional().nullable()
    .or(z.literal('').transform(() => null)),
  cambio: z.enum(['manual', 'automatico', 'cvt', 'automatizado']).optional().nullable()
    .or(z.literal('').transform(() => null)),
});
const atualizarCarro = criarCarro.partial().omit({ cliente_id: true });

// ----- serviços -----
const criarServico = z.object({
  nome: z.string().min(2, 'Nome muito curto'),
  descricao: z.string().optional().nullable(),
  valor_padrao: dinheiro.default(0),
  tempo_estimado_min: z.coerce.number().int().positive().optional().nullable(),
  intervalo_retorno_meses: z.coerce.number().int().positive().max(120).optional().nullable(),
});
const atualizarServico = criarServico.partial().extend({
  ativo: z.boolean().optional(),
});

// ----- ordens de serviço -----
const itemServico = z.object({
  servico_id: uuid.optional().nullable(),
  nome_servico: z.string().min(1).optional(),
  quantidade: z.coerce.number().int().positive().default(1),
  // Opcional: se omitido, o backend puxa o valor_padrao do catálogo.
  valor_unit: dinheiro.optional(),
}).refine((v) => v.servico_id || v.nome_servico, {
  message: 'Informe servico_id ou nome_servico',
});

const itemPeca = z.object({
  descricao: z.string().min(1, 'Descrição da peça é obrigatória'),
  quantidade: z.coerce.number().positive().default(1),
  valor_unit: dinheiro,
});

const clienteInline = z.object({
  nome: z.string().min(2),
  telefone,
  cpf_cnpj: z.string().trim().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  endereco: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

const carroInline = z.object({
  placa,
  marca: z.string().min(1),
  modelo: z.string().min(1),
  ano: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  cor: z.string().optional().nullable(),
  km_atual: z.coerce.number().int().min(0).optional().nullable(),
  chassi: z.string().trim().length(17).optional().nullable().or(z.literal('').transform(() => null)),
});

const criarOS = z.object({
  cliente_id: uuid.optional(),
  carro_id: uuid.optional(),
  novo_cliente: clienteInline.optional(),
  novo_carro: carroInline.optional(),
  km_entrada: z.coerce.number().int().min(0).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  desconto: dinheiro.default(0),
  servicos: z.array(itemServico).default([]),
  pecas: z.array(itemPeca).default([]),
  notificar_whatsapp: z.boolean().default(false),
}).refine((v) => v.cliente_id || v.novo_cliente,
  { message: 'Informe cliente_id ou novo_cliente', path: ['cliente_id'] })
  .refine((v) => v.carro_id || v.novo_carro,
  { message: 'Informe carro_id ou novo_carro', path: ['carro_id'] });

const atualizarOS = z.object({
  km_entrada: z.coerce.number().int().min(0).optional().nullable(),
  observacoes: z.string().optional().nullable(),
  desconto: dinheiro.optional(),
  // Correções pós-pagamento: dono pode ajustar o quanto/quando/como
  // recebeu sem precisar reabrir a OS. `paga_em` acompanha o nome
  // da coluna no schema (a UI pode enviar como `pago_em` que o
  // service normaliza).
  valor_pago: z.coerce.number().min(0).optional().nullable(),
  paga_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  pago_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  forma_pagamento: z.enum(['dinheiro', 'pix', 'boleto', 'cartao_credito',
    'cartao_debito', 'transferencia', 'cheque', 'outro']).optional().nullable(),
});

const FORMAS_PAG = ['dinheiro', 'pix', 'boleto', 'cartao_credito',
  'cartao_debito', 'transferencia', 'cheque', 'outro'];

const mudarStatus = z.object({
  status: z.enum(['aberta', 'em_andamento', 'finalizada', 'paga']),
  notificar_whatsapp: z.boolean().default(false),
  // Só usados quando status === 'paga'
  forma_pagamento: z.enum(FORMAS_PAG).optional(),
  pago_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  valor_pago: z.coerce.number().min(0).optional(),
});

// ----- relatórios -----
const periodo = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD').optional(),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD').optional(),
  limite: z.coerce.number().int().positive().max(100).default(10),
}).refine((v) => !v.inicio || !v.fim || v.inicio <= v.fim, {
  message: 'Data inicial não pode ser maior que a final',
});

// ----- whatsapp -----
const enviarTexto = z.object({
  telefone,
  mensagem: z.string().min(1, 'Mensagem vazia').max(4096),
  cliente_id: uuid.optional().nullable(),
  os_id: uuid.optional().nullable(),
});

const enviarTemplate = z.object({
  telefone,
  template: z.string().min(1, 'Nome do template é obrigatório'),
  idioma: z.string().default('pt_BR'),
  parametros: z.array(z.string()).default([]),
  cliente_id: uuid.optional().nullable(),
  os_id: uuid.optional().nullable(),
});

const paginacao = z.object({
  pagina: z.coerce.number().int().positive().default(1),
  por_pagina: z.coerce.number().int().positive().max(500).default(20),
  busca: z.string().trim().optional(),
});

module.exports = {
  uuid, telefone, placa,
  login, criarUsuario,
  criarCliente, atualizarCliente,
  criarCarro, atualizarCarro,
  criarServico, atualizarServico,
  criarOS, atualizarOS, mudarStatus,
  periodo, paginacao,
  enviarTexto, enviarTemplate,
  idParam: z.object({ id: uuid }),
};
