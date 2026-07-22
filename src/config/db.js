'use strict';
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] erro em cliente ocioso do pool:', err.message);
});

const query = (text, params) => pool.query(text, params);

/**
 * Executa uma função dentro de transação, com rollback automático em erro.
 * Usado onde várias tabelas precisam mudar juntas (ex: OS + itens).
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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

module.exports = { pool, query, withTransaction };
