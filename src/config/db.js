'use strict';
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const env = require('./env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] erro em cliente ocioso do pool:', err.message);
});

/**
 * Contexto por request: guarda o slug da oficina do usuário logado.
 * Populado pelo middleware `oficinaContext` (setado depois do auth).
 * Todo `query()`/`withTransaction()` roda dentro desse escopo e faz
 * `SET LOCAL search_path` antes de executar — tabelas de dados vivem
 * em `oficina_<slug>`, metadata compartilhada (users, oficinas,
 * _migrations, functions, types) em `public`.
 */
const alsOficina = new AsyncLocalStorage();

function runComOficina(slug, fn) {
  return alsOficina.run({ slug }, fn);
}

function schemaAtual() {
  const ctx = alsOficina.getStore();
  return ctx?.slug ? `oficina_${ctx.slug}` : null;
}

/**
 * Sanitiza o slug pra virar identificador SQL (nunca vem de user input
 * direto, mas defense in depth). Só letras minúsculas, dígitos, _.
 */
function schemaSeguro(slug) {
  return `oficina_${String(slug).replace(/[^a-z0-9_]/g, '')}`;
}

async function query(text, params) {
  const schema = schemaAtual();
  if (!schema) {
    // Fora do contexto de uma request autenticada: usa só public.
    // Alertas agendados, migrate.js, scripts CLI caem aqui.
    return pool.query(text, params);
  }
  // Um único round-trip com 2 statements: SET LOCAL só vale numa
  // transação, então abrimos uma implícita. É o preço do isolamento.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL search_path = ${schema}, public`);
    const r = await client.query(text, params);
    await client.query('COMMIT');
    return r;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  const schema = schemaAtual();
  try {
    await client.query('BEGIN');
    if (schema) await client.query(`SET LOCAL search_path = ${schema}, public`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool, query, withTransaction,
  runComOficina, schemaSeguro,
};
