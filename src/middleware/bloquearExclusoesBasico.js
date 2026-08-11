'use strict';
const AppError = require('../utils/AppError');

/**
 * Bloqueia o papel `basico` de fazer qualquer exclusão, com duas
 * exceções pensadas pro fluxo do mecânico:
 *   - Remoção de serviço/peça DENTRO de uma OS: parte da correção
 *     normal enquanto ele está montando a ordem.
 *
 * E também bloqueia o cancelar de agendamento (semanticamente é
 * destrutivo — libera horário e some da vista principal).
 *
 * Não interfere em nenhum outro papel. Roda depois do `auth`.
 */

const ROTAS_DELETE_LIBERADAS = [
  /^\/api\/os\/[^/]+\/servicos\/[^/]+$/,
  /^\/api\/os\/[^/]+\/pecas\/[^/]+$/,
];

const ROTAS_PATCH_BLOQUEADAS = [
  /^\/api\/agendamentos\/[^/]+\/cancelar$/,
];

module.exports = (req, _res, next) => {
  if (req.user?.role !== 'basico') return next();

  if (req.method === 'DELETE') {
    const liberada = ROTAS_DELETE_LIBERADAS.some((rx) => rx.test(req.path));
    if (!liberada) {
      return next(AppError.forbidden('Seu perfil não permite excluir registros'));
    }
  }

  if (req.method === 'PATCH') {
    const bloqueada = ROTAS_PATCH_BLOQUEADAS.some((rx) => rx.test(req.path));
    if (bloqueada) {
      return next(AppError.forbidden('Seu perfil não permite cancelar registros'));
    }
  }

  next();
};
