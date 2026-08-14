'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/os.service');
const clientes = require('../services/clientes.service');
const wa = require('../services/whatsapp.service');
const config = require('../services/config.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');
const { formatBR } = require('../utils/phone');

const listaQuery = v.paginacao.extend({
  status: z.enum(['aberta', 'em_andamento', 'finalizada', 'paga']).optional(),
  cliente_id: v.uuid.optional(),
  marca: z.string().trim().optional(),
  forma_pagamento: z.enum(['dinheiro', 'pix', 'boleto', 'cartao_credito',
    'cartao_debito', 'transferencia', 'cheque', 'outro']).optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});

/**
 * Notificações nunca derrubam a operação principal: se o WhatsApp falhar,
 * a OS já foi criada/atualizada e o erro vai apenas no campo `whatsapp`.
 */
/**
 * Textos por tipo de notificação. Como Evolution API manda texto livre
 * sempre, é só um switch simples.
 */
const TEXTO_OS = {
  abertura: (os) => `Olá, ${os.cliente_nome}! Recebemos seu ${os.marca} ${os.modelo} (${os.placa}). `
    + `Sua OS nº ${os.numero_os} foi aberta. Qualquer novidade avisamos por aqui. — Auto Elétrica Maninho`,
  finalizada: (os) => `Olá, ${os.cliente_nome}! Seu ${os.marca} ${os.modelo} (${os.placa}) está pronto. `
    + `OS nº ${os.numero_os} — total R$ ${Number(os.valor_total).toFixed(2).replace('.', ',')}. `
    + `Pode retirar no horário de funcionamento. — Auto Elétrica Maninho`,
  paga: (os) => {
    const valor = `R$ ${Number(os.valor_pago || os.valor_total).toFixed(2).replace('.', ',')}`;
    return `Obrigado, ${os.cliente_nome}! Recebemos o pagamento de ${valor} `
      + `referente à OS nº ${os.numero_os} (${os.marca} ${os.modelo}). — Auto Elétrica Maninho`;
  },
};

async function notificarSeguro(os, tipo) {
  const w = config.whatsapp();
  if (!w.enabled) return { enviado: false, motivo: 'WhatsApp não configurado' };

  const monta = TEXTO_OS[tipo];
  if (!monta) return { enviado: false, motivo: `Tipo de notificação desconhecido: ${tipo}` };

  try {
    const msg = await wa.notificar({
      telefone: os.cliente_telefone,
      mensagem: monta(os),
      cliente_id: os.cliente_id,
      os_id: os.id,
    });
    return { enviado: true, id: msg?.id, para: formatBR(os.cliente_telefone) };
  } catch (err) {
    return { enviado: false, motivo: err.message };
  }
}

router.get('/', validate({ query: listaQuery }),
  h(async (req, res) => res.json(await svc.listar(req.query))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

router.post('/', validate({ body: v.criarOS }), h(async (req, res) => {
  const os = await svc.criar(req.body, req.user.id);
  const resposta = { ...os };
  if (req.body.notificar_whatsapp) {
    resposta.whatsapp = await notificarSeguro(os, 'abertura');
  }
  res.status(201).json(resposta);
}));

router.put('/:id', validate({ params: v.idParam, body: v.atualizarOS }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.patch('/:id/status', validate({ params: v.idParam, body: v.mudarStatus }),
  h(async (req, res) => {
    const { status, notificar_whatsapp,
      forma_pagamento, pago_em, valor_pago, pagamentos } = req.body;
    const os = await svc.mudarStatus(req.params.id, status,
      { forma_pagamento, pago_em, valor_pago, pagamentos });
    const resposta = { ...os };
    if (notificar_whatsapp && (status === 'finalizada' || status === 'paga')) {
      resposta.whatsapp = await notificarSeguro(os, status);
    }
    res.json(resposta);
  }));

// --- itens da OS ---
const itemServicoBody = z.object({
  servico_id: v.uuid.optional().nullable(),
  nome_servico: z.string().min(1).optional(),
  quantidade: z.coerce.number().int().positive().default(1),
  valor_unit: z.coerce.number().min(0).optional(),
}).refine((x) => x.servico_id || x.nome_servico, { message: 'Informe servico_id ou nome_servico' });

const itemPecaBody = z.object({
  descricao: z.string().min(1),
  quantidade: z.coerce.number().positive().default(1),
  valor_unit: z.coerce.number().min(0),
});

router.post('/:id/servicos', validate({ params: v.idParam, body: itemServicoBody }),
  h(async (req, res) => res.status(201).json(await svc.adicionarServico(req.params.id, req.body))));

router.delete('/:id/servicos/:itemId',
  validate({ params: z.object({ id: v.uuid, itemId: v.uuid }) }),
  h(async (req, res) => res.json(await svc.removerServico(req.params.id, req.params.itemId))));

router.post('/:id/pecas', validate({ params: v.idParam, body: itemPecaBody }),
  h(async (req, res) => res.status(201).json(await svc.adicionarPeca(req.params.id, req.body))));

router.delete('/:id/pecas/:itemId',
  validate({ params: z.object({ id: v.uuid, itemId: v.uuid }) }),
  h(async (req, res) => res.json(await svc.removerPeca(req.params.id, req.params.itemId))));

// Adiantamento/pagamento parcial em OS ainda não paga.
const pagamentoBody = z.object({
  forma: z.enum(['dinheiro', 'pix', 'boleto', 'cartao_credito',
    'cartao_debito', 'transferencia', 'cheque', 'outro']),
  valor: z.coerce.number().positive(),
  pago_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post('/:id/pagamentos', validate({ params: v.idParam, body: pagamentoBody }),
  h(async (req, res) => res.status(201).json(await svc.adicionarPagamento(req.params.id, req.body))));

router.delete('/:id/pagamentos/:pagId',
  validate({ params: z.object({ id: v.uuid, pagId: v.uuid }) }),
  h(async (req, res) => res.json(await svc.removerPagamento(req.params.id, req.params.pagId))));

// Exclui OS inteira (bloqueado se paga)
router.delete('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.remover(req.params.id))));

// Checklist de inspeção visual
router.use('/:id/checklist', require('./checklist.routes'));

module.exports = router;
