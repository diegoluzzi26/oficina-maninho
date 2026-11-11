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
  const f = config.followup();
  return {
    provider: 'evolution',
    setup: {
      url: w.url,
      api_key: config.mascarar(w.apiKey),
      instance: w.instance,
    },
    alerta: { whatsapp: a.whatsapp, hora: a.hora },
    meta: { mensal: m.mensal },
    followup: { auto_gerar: f.auto_gerar },
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
  followup: z.object({
    auto_gerar: z.boolean().optional(),
  }).optional(),
});

const MAPA = {
  'setup.url':      'whatsapp.evolution_url',
  'setup.api_key':  'whatsapp.evolution_api_key',
  'setup.instance': 'whatsapp.evolution_instance',
  'alerta.whatsapp': 'alerta.whatsapp',
  'alerta.hora':     'alerta.hora',
  'meta.mensal':     'meta.mensal',
  'followup.auto_gerar': 'followup.auto_gerar',
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

// ---------------------------------------------------------------------
// Agendamento online (página pública /agendar/<slug>)
// ---------------------------------------------------------------------
const agendaOnline = require('../services/agenda-online.service');

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const horaOuVazio = z.union([hora, z.literal('')]);
const agendaBody = z.object({
  ativo: z.boolean().optional(),
  dias: z.array(z.number().int().min(0).max(6)).min(1, 'Escolha pelo menos um dia').optional(),
  inicio: hora.optional(),
  fim: hora.optional(),
  sabado_fim: horaOuVazio.optional(),
  almoco_inicio: horaOuVazio.optional(),
  almoco_fim: horaOuVazio.optional(),
  intervalo: z.coerce.number().int().min(15).max(240).optional(),
  vagas: z.coerce.number().int().min(1).max(20).optional(),
  antecedencia_h: z.coerce.number().int().min(0).max(168).optional(),
  dias_max: z.coerce.number().int().min(1).max(90).optional(),
  mensagem: z.string().trim().max(300).optional(),
});

router.get('/agenda-online', h(async (_req, res) => res.json(agendaOnline.lerConfig())));

router.put('/agenda-online', validate({ body: agendaBody }), h(async (req, res) => {
  res.json(await agendaOnline.salvarConfig(req.body, req.user.id));
}));

module.exports = router;
