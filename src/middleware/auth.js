'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

module.exports = function auth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized('Token não informado'));
  }
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, nome: payload.nome, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Sessão expirada' : 'Token inválido';
    next(AppError.unauthorized(msg));
  }
};
