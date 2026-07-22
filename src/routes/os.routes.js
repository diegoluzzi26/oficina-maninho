'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/os.service');
const clientes = require('../services/clientes.service');
const wa = require('../services/whatsapp.service');
const env = require('../config/env');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');
const { formatBR } = require('../utils/phone');

const listaQuery = v.paginacao.extend({
  status: z.enum(['aberta', 'em_andamento', 'finalizada', 'paga']).optional(),
  cliente_id: v.uuid.optional(),
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});

/**
 * Notificações nunca derrubam a operação principal: se o WhatsApp falhar,
 * a OS já foi criada/atualizada e o erro vai apenas no campo `whatsapp`.
 */
async function notificarSeguro(os, tipo) {
  if (!env.whatsapp.enabled) return { enviado: false, motivo: 'WhatsApp não configurado' };

  const textos = {
    abertura: `Olá, ${os.cliente_nome}! Recebemos seu ${os.marca} ${os.modelo} (${os.placa}). `
      + `Sua OS nº ${os.numero_os} foi aberta. Qualquer novidade avisamos por aqui. — Auto Elétrica Maninho`,
    finalizada: `Olá, ${os.cliente_nome}! Seu ${os.marca} ${os.modelo} (${os.placa}) está pronto. `
      + `OS nº ${os.numero_os} — total R$ ${Number(os.valor_total).toFixed(2).replace('.', ',')}. `
      + `Pode retirar no horário de funcionamento. — Auto Elétrica Maninho`,
  };
  const templates = {
    abertura: process.env.WHATSAPP_TEMPLATE_ABERTURA || 'os_aberta',
    finalizada: process.env.WHATSAPP_TEMPLATE_FINALIZADA || 'os_finalizada',
  };

  try {
    const msg = await wa.notificar({
      telefone: os.cliente_telefone,
      mensagem: textos[tipo],
      template: templates[tipo],
      parametros: [os.cliente_nome, String(os.numero_os), `${os.marca} ${os.modelo}`],
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
    const { status, notificar_whatsapp, forma_pagamento, pago_em, valor_pago } = req.body;
    const os = await svc.mudarStatus(req.params.id, status,
      { forma_pagamento, pago_em, valor_pago });
    const resposta = { ...os };
    if (notificar_whatsapp && status === 'finalizada') {
      resposta.whatsapp = await notificarSeguro(os, 'finalizada');
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

module.exports = router;
