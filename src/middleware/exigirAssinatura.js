'use strict';
const assinatura = require('../services/assinatura.service');
const AppError = require('../utils/AppError');

/**
 * Bloqueia o acesso às rotas de dados quando a assinatura da oficina está
 * vencida (após o período de graça). Super-admin da plataforma nunca é
 * bloqueado. Use DEPOIS de auth + oficinaContext.
 *
 * Bloqueio devolve 402 (Payment Required) com o motivo — o frontend trata
 * mostrando a tela de "regularize pra continuar". Em período de graça o
 * acesso é liberado, mas `req.assinatura` carrega o aviso (o front mostra
 * banner).
 */
module.exports = async function exigirAssinatura(req, _res, next) {
  try {
    if (!req.user?.id) return next(AppError.unauthorized());
    const info = await assinatura.avaliarParaUsuario(req.user.id);
    if (!info) return next(AppError.unauthorized('Sessão inválida'));
    if (info.super_admin) return next(); // dono da plataforma nunca bloqueia
    if (info.avaliacao.bloqueada) {
      return next(new AppError(info.avaliacao.motivo || 'Assinatura pendente', 402));
    }
    req.assinatura = info.avaliacao; // disponível pros handlers (banner de graça)
    return next();
  } catch (err) {
    next(err);
  }
};
