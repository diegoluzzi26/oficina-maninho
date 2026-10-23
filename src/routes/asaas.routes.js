'use strict';
const router = require('express').Router();
const asaas = require('../services/asaas.service');
const h = require('../utils/asyncHandler');

/**
 * Webhook do Asaas. Sem JWT (o Asaas chama de fora); autenticado pelo token
 * que você define no painel do Asaas e que vem no header asaas-access-token.
 * Responde 200 rápido e processa depois pra o Asaas não repetir o evento.
 */
router.post('/webhook', h(async (req, res) => {
  if (!asaas.webhookValido(req.headers['asaas-access-token'])) {
    return res.status(401).json({ erro: 'token do webhook inválido' });
  }
  res.sendStatus(200);
  try {
    await asaas.processarWebhook(req.body);
  } catch (err) {
    console.error('[asaas] falha ao processar webhook:', err.message);
  }
}));

module.exports = router;
