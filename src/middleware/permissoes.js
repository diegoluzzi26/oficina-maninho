'use strict';
const db = require('../config/db');
const permissoes = require('../config/permissoes');
const AppError = require('../utils/AppError');

/**
 * Lê do banco as permissões do usuário logado e guarda em
 * req.user.permissoes. Vem do banco (não do JWT) pra mudança feita pelo
 * admin valer na hora, sem o usuário precisar sair e entrar.
 * Use DEPOIS de auth.
 */
async function carregarPermissoes(req, _res, next) {
  try {
    if (!req.user?.id) return next(AppError.unauthorized());
    const { rows } = await db.pool.query(
      'SELECT role, permissoes, super_admin FROM users WHERE id = $1 AND ativo', [req.user.id],
    );
    if (!rows[0]) return next(AppError.unauthorized('Usuário inativo'));
    req.user.permissoes = permissoes.efetivas(rows[0]);
    next();
  } catch (err) {
    next(err);
  }
}

/** Libera a rota só pra quem tem o módulo. Use depois de carregarPermissoes. */
function exigirPermissao(modulo) {
  return (req, _res, next) => {
    if (req.user?.permissoes?.includes(modulo)) return next();
    next(AppError.forbidden('Você não tem acesso a esta área. Fale com o administrador da oficina.'));
  };
}

module.exports = { carregarPermissoes, exigirPermissao };
