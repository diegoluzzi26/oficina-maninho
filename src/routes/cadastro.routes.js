'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/cadastro.service');
const AppError = require('../utils/AppError');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

/**
 * Cadastro público (sem JWT): a oficina cria a própria conta de teste pela
 * landing. Devolve token + usuário, igual ao login, pra já entrar logada.
 * Limites e regras em cadastro.service.js.
 */
const body = z.object({
  oficina: z.string().trim().min(2, 'Informe o nome da oficina').max(120),
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: z.string().trim().email('E-mail inválido').max(160),
  telefone: z.string().trim()
    .refine((t) => t.replace(/\D/g, '').length >= 10, 'WhatsApp com DDD'),
  cidade: z.string().trim().max(80).optional(),
  senha: z.string().min(8, 'Senha com pelo menos 8 caracteres').max(100),
  // Campo-armadilha: escondido na tela, só robô preenche.
  site: z.string().optional(),
});

// Atrás do Caddy + nginx: o primeiro IP do X-Forwarded-For é o do visitante.
function ipDe(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'desconhecido';
}

router.post('/', validate({ body }), h(async (req, res) => {
  if (req.body.site) throw new AppError('Não foi possível concluir o cadastro', 400);
  res.status(201).json(await svc.cadastrar(req.body, ipDe(req)));
}));

module.exports = router;
