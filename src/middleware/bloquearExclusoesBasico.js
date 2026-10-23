'use strict';
const AppError = require('../utils/AppError');

/**
 * Bloqueia exclusões de quem não tem a permissão `excluir` (por padrão, o
 * papel `basico`; o admin pode ligar ou desligar por usuário em Equipe),
 * com uma exceção pensada pro fluxo do mecânico:
 *   - Remoção de serviço/peça DENTRO de uma OS: parte da correção
 *     normal enquanto ele está montando a ordem.
 *
 * E também bloqueia o cancelar de agendamento (semanticamente é
 * destrutivo — libera horário e some da vista principal).
 *
 * Roda depois de auth + carregarPermissoes.
 */

const ROTAS_DELETE_LIBERADAS = [
  /^\/api\/os\/[^/]+\/servicos\/[^/]+$/,
  /^\/api\/os\/[^/]+\/pecas\/[^/]+$/,
];

const ROTAS_PATCH_BLOQUEADAS = [
  /^\/api\/agendamentos\/[^/]+\/cancelar$/,
];

module.exports = (req, _res, next) => {
  if (req.user?.permissoes?.includes('excluir')) return next();

  // originalUrl: o router montado em /api/... enxerga req.path sem o prefixo.
  const caminho = req.originalUrl.split('?')[0];

  if (req.method === 'DELETE') {
    const liberada = ROTAS_DELETE_LIBERADAS.some((rx) => rx.test(caminho));
    if (!liberada) {
      return next(AppError.forbidden('Seu perfil não permite excluir registros'));
    }
  }

  if (req.method === 'PATCH') {
    const bloqueada = ROTAS_PATCH_BLOQUEADAS.some((rx) => rx.test(caminho));
    if (bloqueada) {
      return next(AppError.forbidden('Seu perfil não permite cancelar registros'));
    }
  }

  next();
};
