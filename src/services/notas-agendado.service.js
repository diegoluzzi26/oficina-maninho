'use strict';
const db = require('../config/db');
const notas = require('./notas.service');

/**
 * Rede de segurança do webhook da Focus: a cada 5 minutos, reconsulta em
 * cada oficina as notas que continuam 'processando' há mais de 1 minuto
 * (webhook perdido, emissão sem resposta, prefeitura lenta).
 * Oficina sem nota pendente custa só um SELECT.
 */

const INTERVALO_MS = 5 * 60 * 1000;

async function rodar() {
  const { rows } = await db.pool.query('SELECT id, slug FROM oficinas WHERE ativo ORDER BY slug');
  for (const o of rows) {
    try {
      const r = await db.runComOficina(o.slug, () => notas.reconsultarPendentes(o.id));
      if (r.pendentes) console.log(`[notas] ${o.slug}: ${r.atualizadas}/${r.pendentes} reconsultada(s)`);
    } catch (err) {
      console.error(`[notas] ${o.slug}: ${err.message}`);
    }
  }
}

function agendar() {
  let rodando = false;
  setInterval(async () => {
    if (rodando) return;
    rodando = true;
    try { await rodar(); } finally { rodando = false; }
  }, INTERVALO_MS).unref();
}

module.exports = { agendar, rodar };
