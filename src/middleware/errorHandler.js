'use strict';
const env = require('../config/env');
const AppError = require('../utils/AppError');

/**
 * Traduz erros do Postgres em respostas HTTP úteis. Sem isso, uma placa
 * duplicada vira 500 genérico e o atendente não sabe o que corrigir.
 */
function fromPgError(err) {
  switch (err.code) {
    case '23505': { // unique_violation
      const campo = (err.detail || '').match(/\(([^)]+)\)/)?.[1] || 'campo';
      const amigavel = {
        placa: 'Já existe um carro cadastrado com esta placa',
        chassi: 'Já existe um carro cadastrado com este chassi',
        cpf_cnpj: 'Já existe um cliente com este CPF/CNPJ',
        email: 'Este e-mail já está em uso',
      }[campo];
      return new AppError(amigavel || `Valor duplicado para ${campo}`, 409);
    }
    case '23503': // foreign_key_violation
      return new AppError('Registro relacionado não encontrado ou em uso', 409);
    case '23514': // check_violation (inclui nossa validação carro/cliente)
      return new AppError(err.message.includes('não pertence')
        ? 'O carro informado não pertence a este cliente'
        : 'Valor fora do permitido para este campo', 422);
    case '22P02': // invalid_text_representation (UUID malformado)
      return new AppError('Identificador inválido', 400);
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
module.exports = (err, _req, res, _next) => {
  let e = err;

  if (!(e instanceof AppError) && e && e.code) {
    e = fromPgError(err) || err;
  }

  if (e instanceof AppError) {
    return res.status(e.statusCode).json({
      erro: e.message,
      ...(e.details ? { detalhes: e.details } : {}),
    });
  }

  console.error('[erro nao tratado]', err);
  res.status(500).json({
    erro: 'Erro interno do servidor',
    ...(env.nodeEnv !== 'production' ? { debug: String(err && err.message) } : {}),
  });
};
