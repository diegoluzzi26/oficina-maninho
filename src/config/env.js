'use strict';
require('dotenv').config();

/**
 * Valida as variáveis no boot. Falhar aqui é melhor do que descobrir
 * token faltando na hora de enviar mensagem pro cliente.
 */
function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return v;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  databaseUrl: required('DATABASE_URL'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.PHONE_NUMBER_ID || '',
    verifyToken: process.env.VERIFY_TOKEN || '',
    wabaId: process.env.WABA_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    defaultLang: process.env.WHATSAPP_DEFAULT_LANG || 'pt_BR',
  },
};

env.whatsapp.enabled = Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId);

module.exports = env;
