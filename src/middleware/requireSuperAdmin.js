'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Exige que o usuário logado seja super-admin da plataforma (users.super_admin).
 * Consulta fresca no banco (public) — não depende do JWT carregar a flag, e
 * revoga na hora se o super_admin for removido. Use depois de `auth`.
 */
module.exports = async function requireSuperAdmin(req, _res, next) {
  try {
    if (!req.user?.id) return next(AppError.unauthorized());
    const { rows } = await db.pool.query(
      'SELECT super_admin FROM users WHERE id = $1 AND ativo', [req.user.id],
    );
    if (rows[0]?.super_admin) return next();
    return next(AppError.forbidden('Requer super-admin da plataforma'));
  } catch (err) {
    next(err);
  }
};
