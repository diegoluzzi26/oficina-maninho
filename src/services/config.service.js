'use strict';
const db = require('../config/db');
const env = require('../config/env');

/**
 * Configurações editáveis em runtime.
 *
 * Fonte: tabela `configuracoes` (chave/valor). Se a chave NÃO existe
 * no banco, cai no valor do .env (definido em src/config/env.js).
 * O .env deixa de ser a fonte única de verdade e vira "default".
 *
 * Cache in-memory: evita ir ao banco a cada envio de WhatsApp. É invalidado
 * quando `set()` é chamado — como só admin edita e é raro, um cache
 * simples num processo só é suficiente.
 */

const cache = new Map();

async function inicializar() {
  cache.clear();
  const { rows } = await db.query(
    'SELECT chave, valor FROM configuracoes WHERE valor IS NOT NULL',
  );
  for (const r of rows) cache.set(r.chave, r.valor);
}

function get(chave, defaultVal = null) {
  return cache.has(chave) ? cache.get(chave) : defaultVal;
}

async function set(chave, valor, userId = null) {
  if (valor === undefined || valor === null || valor === '') {
    await db.query('DELETE FROM configuracoes WHERE chave = $1', [chave]);
    cache.delete(chave);
    return;
  }
  await db.query(
    `INSERT INTO configuracoes (chave, valor, atualizado_por)
     VALUES ($1, $2, $3)
     ON CONFLICT (chave) DO UPDATE
       SET valor = EXCLUDED.valor,
           atualizado_por = EXCLUDED.atualizado_por,
           atualizado_em = now()`,
    [chave, String(valor), userId],
  );
  cache.set(chave, String(valor));
}

/**
 * Config efetiva do WhatsApp (provider: Evolution API).
 * Shape mantida como `whatsapp()` pra os call sites continuarem
 * funcionando sem alteração — só o interior muda.
 */
function whatsapp() {
  const url      = get('whatsapp.evolution_url',      env.whatsapp.url);
  const apiKey   = get('whatsapp.evolution_api_key',  env.whatsapp.apiKey);
  const instance = get('whatsapp.evolution_instance', env.whatsapp.instance);

  return {
    url, apiKey, instance,
    provider: 'evolution',
    enabled: Boolean(url && apiKey && instance),
  };
}

function alerta() {
  return {
    whatsapp: get('alerta.whatsapp', process.env.ALERTA_WHATSAPP || ''),
    hora: Number(get('alerta.hora', process.env.ALERTA_HORA || 8)),
  };
}

/**
 * Meta de faturamento mensal. NULL = sem meta configurada, o painel
 * esconde o bloco pra não poluir a tela de quem não usa.
 */
function meta() {
  const mensal = get('meta.mensal', null);
  return { mensal: mensal ? Number(mensal) : null };
}

/**
 * Mascara chave secreta (mostra só últimos 4 chars) — usado no GET da API
 * pra não retornar o token cru pra frontend.
 */
function mascarar(valor) {
  if (!valor) return '';
  if (valor.length <= 4) return '••••';
  return `••••${valor.slice(-4)}`;
}

module.exports = { inicializar, get, set, whatsapp, alerta, meta, mascarar };
