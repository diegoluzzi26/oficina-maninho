'use strict';
/**
 * Importa a tabela NCM oficial pra public.ncm.
 *
 *   node scripts/importar-ncm.js              baixa do Portal Único Siscomex
 *   node scripts/importar-ncm.js arquivo.json usa um JSON já baixado
 *
 * A api também importa sozinha na subida quando a tabela está vazia ou tem
 * mais de 30 dias (ncm.service.atualizarSeVelha).
 */
const fs = require('fs');
const { pool } = require('../src/config/db');
const ncm = require('../src/services/ncm.service');

(async () => {
  try {
    const arquivo = process.argv[2];
    const r = arquivo
      ? await ncm.gravar(JSON.parse(fs.readFileSync(arquivo, 'utf8')))
      : await ncm.importar();
    console.log(`NCM importada: ${r.total} códigos · ${r.vigencia || ''} · ${r.ato || ''}`);
  } catch (err) {
    console.error(`Falhou: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
