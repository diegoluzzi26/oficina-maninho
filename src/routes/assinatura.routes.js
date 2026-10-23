'use strict';
const router = require('express').Router();
const assinatura = require('../services/assinatura.service');
const planos = require('../config/planos');
const h = require('../utils/asyncHandler');

/**
 * Status da assinatura da PRÓPRIA oficina do usuário logado.
 * Fica FORA do middleware exigirAssinatura de propósito: mesmo bloqueado,
 * o frontend precisa ler isso pra montar a tela de "regularize pra continuar".
 */
router.get('/minha', h(async (req, res) => {
  // Deriva a oficina pelo usuário logado (não confia no oficina_id do token).
  const info = await assinatura.avaliarParaUsuario(req.user.id);
  if (!info) return res.json({ avaliacao: { bloqueada: false } });
  res.json({
    status: info.oficina.status,
    plano: info.oficina.plano,
    // Super-admin enxerga tudo: recursos do plano completo.
    recursos: planos.doPlano(info.super_admin ? 'completo' : info.oficina.plano).recursos,
    trial_fim: info.oficina.trial_fim,
    proximo_vencimento: info.oficina.proximo_vencimento,
    super_admin: info.super_admin,
    avaliacao: info.avaliacao,
  });
}));

// Tabela de planos (preço, usuários, recursos) pra tela de plano.
router.get('/planos', (_req, res) => {
  res.json(planos.ORDEM.map((chave) => ({ chave, ...planos.PLANOS[chave] })));
});

module.exports = router;
