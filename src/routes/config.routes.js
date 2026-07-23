'use strict';
const router = require('express').Router();
const { z } = require('zod');
const config = require('../services/config.service');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

/**
 * Configurações editáveis em runtime.
 * Todas as rotas exigem role 'admin' — atendente não vê nem edita.
 * API key é MASCARADA no GET e PUT ignora campo vazio.
 */

router.use(requireRole('admin'));

function estadoAtual() {
  const w = config.whatsapp();
  const a = config.alerta();
  const m = config.meta();
  return {
    provider: 'evolution',
    setup: {
      url: w.url,
      api_key: config.mascarar(w.apiKey),
      instance: w.instance,
    },
    alerta: { whatsapp: a.whatsapp, hora: a.hora },
    meta: { mensal: m.mensal },
    enabled: w.enabled,
  };
}

router.get('/whatsapp', h(async (_req, res) => res.json(estadoAtual())));

const putBody = z.object({
  setup: z.object({
    url: z.string().optional(),
    api_key: z.string().optional(),
    instance: z.string().optional(),
  }).optional(),
  alerta: z.object({
    whatsapp: z.string().optional(),
    hora: z.coerce.number().int().min(0).max(23).optional(),
  }).optional(),
  meta: z.object({
    mensal: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  }).optional(),
});

const MAPA = {
  'setup.url':      'whatsapp.evolution_url',
  'setup.api_key':  'whatsapp.evolution_api_key',
  'setup.instance': 'whatsapp.evolution_instance',
  'alerta.whatsapp': 'alerta.whatsapp',
  'alerta.hora':     'alerta.hora',
  'meta.mensal':     'meta.mensal',
};

router.put('/whatsapp', validate({ body: putBody }), h(async (req, res) => {
  for (const [caminho, chaveDb] of Object.entries(MAPA)) {
    const [grupo, campo] = caminho.split('.');
    const valor = req.body[grupo]?.[campo];
    if (valor !== undefined) {
      await config.set(chaveDb, valor, req.user.id);
    }
  }
  res.json(estadoAtual());
}));

module.exports = router;
