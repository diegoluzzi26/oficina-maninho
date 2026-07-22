'use strict';
const AppError = require('../utils/AppError');

/** requireRole('admin') — atendente não passa. Use sempre depois de auth. */
module.exports = (...roles) => (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(AppError.forbidden('Seu perfil não tem permissão para esta ação'));
  }
  next();
};
