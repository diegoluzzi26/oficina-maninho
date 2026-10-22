'use strict';
const contrato = require('../services/contrato.service');
const AppError = require('../utils/AppError');

/**
 * Bloqueia as rotas de dados se a oficina ainda não aceitou a versão
 * vigente do contrato. Maninho e super-admin são isentos (tratado no
 * statusParaUsuario). Use depois de auth + oficinaContext.
 *
 * Devolve 403 — o frontend trata mostrando a tela de aceite (pro admin) ou
 * de "aguarde o responsável" (pros demais). As rotas de /api/contrato
 * ficam FORA deste middleware pra permitir ler e aceitar.
 */
module.exports = async function exigirContrato(req, _res, next) {
  try {
    if (!req.user?.id) return next(AppError.unauthorized());
    const info = await contrato.statusParaUsuario(req.user.id);
    if (info && info.pendente) {
      return next(new AppError('Termos de uso pendentes de aceite', 403));
    }
    return next();
  } catch (err) {
    next(err);
  }
};
