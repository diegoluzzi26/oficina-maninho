'use strict';
const crypto = require('crypto');
const AppError = require('./AppError');

/**
 * Criptografia simétrica de segredos guardados no banco (ex: tokens da
 * Focus NFe por oficina). AES-256-GCM, chave de 32 bytes em
 * FISCAL_ENC_KEY no .env (hex de 64 chars ou base64).
 *
 * Formato gravado: "v1:<iv b64>:<tag b64>:<cifrado b64>". O prefixo de
 * versão deixa trocar o algoritmo/chave no futuro sem ambiguidade.
 *
 * Gerar uma chave:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

function chave() {
  const bruta = process.env.FISCAL_ENC_KEY || '';
  const buf = /^[0-9a-fA-F]{64}$/.test(bruta) ? Buffer.from(bruta, 'hex') : Buffer.from(bruta, 'base64');
  if (buf.length !== 32) {
    throw new AppError('FISCAL_ENC_KEY ausente ou inválida no .env (precisa de 32 bytes)', 503);
  }
  return buf;
}

function cifrar(texto) {
  if (texto === null || texto === undefined || texto === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const cifrado = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), cifrado.toString('base64')].join(':');
}

function decifrar(valor) {
  if (!valor) return null;
  const [versao, iv, tag, cifrado] = String(valor).split(':');
  if (versao !== 'v1' || !iv || !tag || !cifrado) throw new Error('Segredo em formato desconhecido');
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(cifrado, 'base64')), d.final()]).toString('utf8');
}

module.exports = { cifrar, decifrar };
