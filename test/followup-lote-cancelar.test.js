'use strict';
/**
 * Envio em lote do follow-up: dá para parar no meio. O que já saiu fica
 * enviado; o resto continua pendente.
 *
 * Como rodar: ver test/README.md (exige TEST_DATABASE_URL num banco de teste).
 */
process.env.FOLLOWUP_LOTE_INTERVALO_MS = '400';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/tenancy');

let ctx;
let db;

before(async () => {
  ctx = await setup();
  const aceite = await ctx.api('/api/contrato/aceitar', { method: 'POST', token: ctx.tokenA, body: {} });
  assert.ok(aceite.status < 300, `aceite do contrato: ${JSON.stringify(aceite.data)}`);
  db = require('../src/config/db');
  const wa = require('../src/services/whatsapp.service');
  wa.notificar = async () => ({ wa_message_id: 'W1' });
});
after(async () => { if (ctx) await ctx.teardown(); });

const api = (path, opt = {}) => ctx.api(path, { token: ctx.tokenA, ...opt });
const q = (sql, p) => db.runComOficina('ta', () => db.query(sql, p)).then((r) => r.rows);
const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function esperarFim() {
  for (let i = 0; i < 40; i += 1) {
    const e = await api('/api/followup/fila/envio-lote');
    if (!e.data?.em_andamento) return e.data;
    await esperar(100);
  }
  throw new Error('lote não terminou');
}

test('parar o envio em lote: o primeiro sai, os outros continuam pendentes', async () => {
  await q('DELETE FROM followup_fila');
  for (const m of ['mensagem um', 'mensagem dois', 'mensagem três']) {
    const r = await api('/api/followup/fila/manual', {
      method: 'POST', body: { cliente_id: ctx.idsA.cliente, tipo: 'manutencao', mensagem: m },
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }

  const ini = await api('/api/followup/fila/enviar-pendentes', { method: 'POST', body: {} });
  assert.equal(ini.status, 202, JSON.stringify(ini.data));
  assert.equal(ini.data.total, 3);

  await esperar(150); // o primeiro já saiu; está no intervalo antes do segundo
  const c = await api('/api/followup/fila/envio-lote/cancelar', { method: 'POST', body: {} });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.cancelado, true);

  const fim = await esperarFim();
  assert.equal(fim.cancelado, true);
  assert.equal(fim.enviados, 1);

  const st = await q('SELECT status, count(*)::int AS n FROM followup_fila GROUP BY status ORDER BY status::text');
  assert.deepEqual(st, [{ status: 'enviado', n: 1 }, { status: 'pendente', n: 2 }]);

  const denovo = await api('/api/followup/fila/envio-lote/cancelar', { method: 'POST', body: {} });
  assert.equal(denovo.status, 409, 'sem lote rodando não há o que parar');
});
