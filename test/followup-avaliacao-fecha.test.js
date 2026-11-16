'use strict';
/**
 * Pedido de avaliação não fica em "Aguardando resposta" nem em "Em conversa":
 * depois de enviado já aparece em Fechados. Os outros tipos seguem o fluxo.
 *
 * Como rodar: ver test/README.md (exige TEST_DATABASE_URL num banco de teste).
 */
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
});
after(async () => { if (ctx) await ctx.teardown(); });

const api = (path, opt = {}) => ctx.api(path, { token: ctx.tokenA, ...opt });
const q = (sql, p) => db.runComOficina('ta', () => db.query(sql, p)).then((r) => r.rows);

async function card(tipo, status) {
  const r = await api('/api/followup/fila/manual', {
    method: 'POST', body: { cliente_id: ctx.idsA.cliente, tipo, mensagem: `${tipo} ${status}` },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  if (status !== 'pendente') {
    await q(`UPDATE followup_fila SET status = $2::text::followup_status, enviado_em = now(),
                    respondido_em = CASE WHEN $2::text = 'respondeu' THEN now() END
              WHERE id = $1`, [r.data.id, status]);
  }
  return r.data.id;
}

test('avaliação enviada ou respondida vai para Fechados; os outros tipos não', async () => {
  await q('DELETE FROM followup_fila');
  const avPendente = await card('avaliacao', 'pendente');
  const avEnviada = await card('avaliacao', 'enviado');
  const avRespondeu = await card('avaliacao', 'respondeu');
  const revEnviada = await card('reativacao', 'enviado');

  const k = await api('/api/followup/kanban');
  assert.equal(k.status, 200, JSON.stringify(k.data));
  const coluna = (id) => Object.entries(k.data.colunas).find(([, itens]) => itens.some((i) => i.id === id))?.[0];

  assert.equal(coluna(avPendente), 'a-fazer');
  assert.equal(coluna(avEnviada), 'fechado');
  assert.equal(coluna(avRespondeu), 'fechado');
  assert.equal(coluna(revEnviada), 'enviado');
  assert.equal(k.data.colunas.fechado.find((i) => i.id === avEnviada).status, 'enviado', 'status segue enviado');
});
