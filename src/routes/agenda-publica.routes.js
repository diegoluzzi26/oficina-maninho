'use strict';
const router = require('express').Router();
const { z } = require('zod');
const db = require('../config/db');
const config = require('../services/config.service');
const svc = require('../services/agenda-online.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const AppError = require('../utils/AppError');
const h = require('../utils/asyncHandler');

/**
 * Agendamento online (público, sem JWT): página /agendar/<slug> que a
 * oficina coloca no Perfil da Empresa no Google. A oficina vem do slug
 * da URL; daqui pra frente as queries rodam no schema dela.
 * Regras e limites em agenda-online.service.js.
 */

const SLUG_RE = /^[a-z][a-z0-9_]{2,30}$/;

router.use('/:slug', (req, _res, next) => {
  const { slug } = req.params;
  if (!SLUG_RE.test(slug)) return next(AppError.notFound('Oficina não encontrada'));
  db.runComOficina(slug, () => {
    config.carregar().then(() => next()).catch(next);
  });
});

// Atrás do Caddy + nginx: o primeiro IP do X-Forwarded-For é o do visitante.
function ipDe(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'desconhecido';
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

router.get('/:slug', h(async (req, res) => {
  res.json(await svc.dadosPublicos(req.params.slug));
}));

router.get('/:slug/horarios', validate({ query: z.object({ data }) }), h(async (req, res) => {
  await svc.oficinaPublica(req.params.slug);
  const livres = await svc.horariosLivres(req.query.data);
  res.json({ data: req.query.data, horarios: livres.map((s) => s.hora) });
}));

const body = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  telefone: z.string().trim()
    .refine((t) => t.replace(/\D/g, '').length >= 10, 'WhatsApp com DDD'),
  placa: v.placa,
  marca: z.string().trim().min(2, 'Informe a marca').max(40),
  modelo: z.string().trim().min(1, 'Informe o modelo').max(60),
  data,
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido'),
  servico_ids: z.array(v.uuid).max(5).optional(),
  observacoes: z.string().trim().max(500).optional(),
  // Campo-armadilha: escondido na tela, só robô preenche.
  site: z.string().optional(),
});

router.post('/:slug', validate({ body }), h(async (req, res) => {
  if (req.body.site) throw new AppError('Não foi possível agendar', 400);
  res.status(201).json(await svc.agendar(req.params.slug, req.body, ipDe(req)));
}));

module.exports = router;
