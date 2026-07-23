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
 * Retorna a config efetiva do WhatsApp, na mesma "shape" que `env.whatsapp`
 * tinha antes — para call sites migrarem sem ter que aprender API nova.
 */
function whatsapp() {
  const token          = get('whatsapp.token',            env.whatsapp.token);
  const phoneNumberId  = get('whatsapp.phone_number_id',  env.whatsapp.phoneNumberId);
  const verifyToken    = get('whatsapp.verify_token',     env.whatsapp.verifyToken);
  const wabaId         = get('whatsapp.waba_id',          env.whatsapp.wabaId);
  const apiVersion     = get('whatsapp.api_version',      env.whatsapp.apiVersion);
  const defaultLang    = get('whatsapp.default_lang',     env.whatsapp.defaultLang);

  return {
    token, phoneNumberId, verifyToken, wabaId, apiVersion, defaultLang,
    templates: {
      abertura:   get('whatsapp.template_abertura',   process.env.WHATSAPP_TEMPLATE_ABERTURA   || 'os_aberta'),
      finalizada: get('whatsapp.template_finalizada', process.env.WHATSAPP_TEMPLATE_FINALIZADA || 'os_finalizada'),
      paga:       get('whatsapp.template_paga',       process.env.WHATSAPP_TEMPLATE_PAGA       || 'os_paga'),
      retorno:    get('whatsapp.template_retorno',    process.env.WHATSAPP_TEMPLATE_RETORNO    || 'retorno_agendado'),
      lembrete:   get('whatsapp.template_lembrete',   process.env.WHATSAPP_TEMPLATE_LEMBRETE   || 'lembrete_agendamento'),
      alerta:     get('whatsapp.template_alerta',     process.env.WHATSAPP_TEMPLATE_ALERTA     || 'alerta_contas'),
    },
    enabled: Boolean(token && phoneNumberId),
  };
}

function alerta() {
  return {
    whatsapp: get('alerta.whatsapp', process.env.ALERTA_WHATSAPP || ''),
    hora: Number(get('alerta.hora', process.env.ALERTA_HORA || 8)),
  };
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

module.exports = { inicializar, get, set, whatsapp, alerta, mascarar };
