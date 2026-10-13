'use strict';
const db = require('../config/db');
const env = require('../config/env');

/**
 * Configurações editáveis em runtime.
 *
 * Fonte: tabela `configuracoes` (chave/valor), que vive em cada schema
 * `oficina_<slug>`. Se a chave NÃO existe no banco, cai no valor do .env
 * (default global). O .env deixa de ser fonte única de verdade.
 *
 * Cache in-memory POR OFICINA: `caches` mapeia slug → Map(chave→valor).
 * `get`/`set`/`whatsapp`/etc resolvem o slug do contexto atual
 * (AsyncLocalStorage via db.slugAtual()). Isso permite que cada oficina
 * tenha sua própria config (ex: número de WhatsApp) sem uma vazar na outra.
 *
 * Carga: `carregar()` popula o cache da oficina atual (precisa rodar dentro
 * de runComOficina). O middleware oficinaContext chama antes de cada request;
 * os agendadores chamam dentro de paraCadaOficinaAtiva. `set()` mantém o
 * cache da oficina em sincronia sem reler o banco.
 */

const caches = new Map();     // slug -> Map(chave->valor)
const carregados = new Set(); // slugs já carregados pelo menos uma vez

function subcache(slug) {
  let m = caches.get(slug);
  if (!m) { m = new Map(); caches.set(slug, m); }
  return m;
}

/**
 * Carrega (ou recarrega) a config da oficina ATUAL no cache.
 * Precisa de contexto (runComOficina); fora dele, no-op.
 */
async function carregar({ forcar = false } = {}) {
  const slug = db.slugAtual();
  if (!slug) return;
  if (!forcar && carregados.has(slug)) return;
  const { rows } = await db.query(
    'SELECT chave, valor FROM configuracoes WHERE valor IS NOT NULL',
  );
  const m = new Map();
  for (const r of rows) m.set(r.chave, r.valor);
  caches.set(slug, m);
  carregados.add(slug);
}

// Retrocompat: `inicializar` força a carga da oficina atual.
async function inicializar() { return carregar({ forcar: true }); }

function get(chave, defaultVal = null) {
  const slug = db.slugAtual();
  const m = slug ? caches.get(slug) : null;
  return m && m.has(chave) ? m.get(chave) : defaultVal;
}

async function set(chave, valor, userId = null) {
  const slug = db.slugAtual();
  if (valor === undefined || valor === null || valor === '') {
    await db.query('DELETE FROM configuracoes WHERE chave = $1', [chave]);
    if (slug) subcache(slug).delete(chave);
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
  if (slug) subcache(slug).set(chave, String(valor));
}

/**
 * Config efetiva do WhatsApp (provider: Evolution API).
 * Shape mantida como `whatsapp()` pra os call sites continuarem
 * funcionando sem alteração — só o interior muda.
 */
function whatsapp() {
  // Cada oficina tem sua própria instância (= próprio número) na Evolution.
  // Default = slug da oficina, pra nascer distinta sem config manual.
  // url/apiKey têm default compartilhado do .env, mas são sobrescrevíveis.
  const slug     = db.slugAtual();
  const url      = get('whatsapp.evolution_url',      env.whatsapp.url);
  const apiKey   = get('whatsapp.evolution_api_key',  env.whatsapp.apiKey);
  const instance = get('whatsapp.evolution_instance', slug || env.whatsapp.instance);

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
 * Follow-up automático. `auto_gerar` liga/desliga a geração diária da fila
 * pelo agendador (followup-agendado.service). Default ligado — só gera os
 * pendentes, não envia WhatsApp.
 */
function followup() {
  return {
    auto_gerar: get('followup.auto_gerar', 'true') !== 'false',
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

module.exports = {
  inicializar, carregar, get, set,
  whatsapp, alerta, meta, followup, mascarar,
};
