'use strict';
const assinatura = require('../services/assinatura.service');
const planos = require('../config/planos');
const AppError = require('../utils/AppError');

/**
 * Libera a rota só se o plano da oficina inclui o recurso (ver
 * src/config/planos.js). Super-admin da plataforma nunca é barrado.
 * Use DEPOIS de auth + oficinaContext.
 *
 * Nega com 403 e `details.recurso`/`details.plano_minimo` — o frontend usa
 * pra mostrar "disponível no plano X".
 */
module.exports = function exigirRecurso(recurso) {
  return async function (req, _res, next) {
    try {
      if (!req.user?.id) return next(AppError.unauthorized());
      const info = await assinatura.avaliarParaUsuario(req.user.id);
      if (!info) return next(AppError.unauthorized('Sessão inválida'));
      if (info.super_admin || planos.temRecurso(info.oficina.plano, recurso)) return next();
      const minimo = planos.planoMinimo(recurso);
      return next(new AppError(
        `Recurso disponível a partir do plano ${planos.doPlano(minimo).nome}`,
        403,
        { recurso, plano_minimo: minimo },
      ));
    } catch (err) {
      next(err);
    }
  };
};
