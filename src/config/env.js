'use strict';
require('dotenv').config();

/**
 * Valida as variáveis no boot. Falhar aqui é melhor do que descobrir
 * config faltando quando alguém tenta enviar mensagem.
 *
 * Nota: WhatsApp aqui vira só o DEFAULT — o valor efetivo é resolvido
 * em runtime por `services/config.service.js` (banco > env). Isso
 * permite editar sem reiniciar o container.
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

  // Evolution API (WhatsApp self-hosted via Baileys)
  whatsapp: {
    url:      process.env.EVOLUTION_URL      || 'http://evolution:8080',
    apiKey:   process.env.EVOLUTION_API_KEY  || '',
    instance: process.env.EVOLUTION_INSTANCE || 'oficina',
  },
};

module.exports = env;
