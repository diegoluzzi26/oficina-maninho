'use strict';
/** Aplica migrations em ordem, uma vez cada, dentro de transação. */
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const DIR = path.join(__dirname, '..', 'migrations');

(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        nome TEXT PRIMARY KEY,
        aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    const aplicadas = new Set(
      (await client.query('SELECT nome FROM _migrations')).rows.map((r) => r.nome),
    );
    const arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

    let n = 0;
    for (const arq of arquivos) {
      if (aplicadas.has(arq)) { console.log(`  = ${arq} (já aplicada)`); continue; }
      const sql = fs.readFileSync(path.join(DIR, arq), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (nome) VALUES ($1)', [arq]);
        await client.query('COMMIT');
        console.log(`  ✓ ${arq}`);
        n += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${arq}: ${err.message}`);
        process.exit(1);
      }
    }
    console.log(n ? `\n${n} migration(s) aplicada(s).` : '\nBanco já está atualizado.');
  } finally {
    client.release();
    await pool.end();
  }
})();
