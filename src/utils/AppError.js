'use strict';

class AppError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
  static notFound(msg = 'Recurso não encontrado') { return new AppError(msg, 404); }
  static unauthorized(msg = 'Não autenticado')     { return new AppError(msg, 401); }
  static forbidden(msg = 'Acesso negado')          { return new AppError(msg, 403); }
  static conflict(msg = 'Conflito de dados')       { return new AppError(msg, 409); }
}

module.exports = AppError;
