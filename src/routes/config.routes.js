'use strict';
const router = require('express').Router();
const { z } = require('zod');
const config = require('../services/config.service');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

/**
 * Configurações que aparecem na tela "Configurações".
 * Todas as rotas exigem role 'admin' — atendente não vê nem edita.
 *
 * Segredos (token, verify_token) são MASCARADOS no GET e o PUT ignora
 * campo vazio para não zerar o valor sem querer.
 */

router.use(requireRole('admin'));

/**
 * GET /api/config/whatsapp — devolve o que a UI precisa mostrar.
 * Token e verify_token vêm mascarados; a UI usa isso só como pista
 * de "há algo configurado".
 */
router.get('/whatsapp', h(async (_req, res) => {
  const w = config.whatsapp();
  const a = config.alerta();

  res.json({
    setup: {
      token: config.mascarar(w.token),
      phone_number_id: w.phoneNumberId,
      verify_token: config.mascarar(w.verifyToken),
      waba_id: w.wabaId,
      api_version: w.apiVersion,
      default_lang: w.defaultLang,
    },
    templates: w.templates,
    alerta: {
      whatsapp: a.whatsapp,
      hora: a.hora,
    },
    enabled: w.enabled,
  });
}));

const putBody = z.object({
  setup: z.object({
    token: z.string().optional(),
    phone_number_id: z.string().optional(),
    verify_token: z.string().optional(),
    waba_id: z.string().optional(),
    api_version: z.string().optional(),
    default_lang: z.string().optional(),
  }).optional(),
  templates: z.object({
    abertura: z.string().optional(),
    finalizada: z.string().optional(),
    paga: z.string().optional(),
    retorno: z.string().optional(),
    lembrete: z.string().optional(),
    alerta: z.string().optional(),
  }).optional(),
  alerta: z.object({
    whatsapp: z.string().optional(),
    hora: z.coerce.number().int().min(0).max(23).optional(),
  }).optional(),
});

const MAPA = {
  'setup.token':           'whatsapp.token',
  'setup.phone_number_id': 'whatsapp.phone_number_id',
  'setup.verify_token':    'whatsapp.verify_token',
  'setup.waba_id':         'whatsapp.waba_id',
  'setup.api_version':     'whatsapp.api_version',
  'setup.default_lang':    'whatsapp.default_lang',
  'templates.abertura':    'whatsapp.template_abertura',
  'templates.finalizada':  'whatsapp.template_finalizada',
  'templates.paga':        'whatsapp.template_paga',
  'templates.retorno':     'whatsapp.template_retorno',
  'templates.lembrete':    'whatsapp.template_lembrete',
  'templates.alerta':      'whatsapp.template_alerta',
  'alerta.whatsapp':       'alerta.whatsapp',
  'alerta.hora':           'alerta.hora',
};

router.put('/whatsapp', validate({ body: putBody }), h(async (req, res) => {
  for (const [caminho, chaveDb] of Object.entries(MAPA)) {
    const [grupo, campo] = caminho.split('.');
    const valor = req.body[grupo]?.[campo];
    // undefined = campo não veio (não mexe). '' = user quer LIMPAR = deleta linha.
    // O `set` já trata os dois casos.
    if (valor !== undefined) {
      await config.set(chaveDb, valor, req.user.id);
    }
  }

  // Retorna o estado atualizado (mascarado)
  const w = config.whatsapp();
  const a = config.alerta();
  res.json({
    setup: {
      token: config.mascarar(w.token),
      phone_number_id: w.phoneNumberId,
      verify_token: config.mascarar(w.verifyToken),
      waba_id: w.wabaId,
      api_version: w.apiVersion,
      default_lang: w.defaultLang,
    },
    templates: w.templates,
    alerta: { whatsapp: a.whatsapp, hora: a.hora },
    enabled: w.enabled,
  });
}));

module.exports = router;
