'use strict';
const router = require('express').Router();
const svc = require('../services/contrato.service');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

/**
 * Contrato da própria oficina. FORA dos middlewares de enforcement
 * (exigirAssinatura/exigirContrato) pra o front conseguir ler e aceitar
 * mesmo com o aceite pendente.
 */

// Status do aceite + texto vigente (pra montar a tela de aceite).
router.get('/status', h(async (req, res) => {
  const status = await svc.statusParaUsuario(req.user.id);
  const contrato = await svc.versaoAtual();
  res.json({ ...status, contrato });
}));

// Aceite da versão vigente — só admin aceita pela oficina.
router.post('/aceitar', requireRole('admin'), h(async (req, res) => {
  const r = await svc.aceitar(req.user.oficina_id, req.user.id, req.ip);
  res.status(201).json(r);
}));

module.exports = router;
