'use strict';
/**
 * Mudar a mensagem de uma automação muda também o texto dos cards dela que
 * ainda estão pendentes na fila. O que já saiu ou está saindo não muda.
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

test('salvar mensagem nova remonta os pendentes da automação', async () => {
  await q('DELETE FROM followup_fila');
  const cria = await api('/api/followup/automacoes', {
    method: 'POST',
    body: { nome: 'Sumidos', gatilho: 'sumido', intervalo_dias: 90, mensagem_template: 'Texto antigo para {nome_cliente}.' },
  });
  assert.equal(cria.status, 201, JSON.stringify(cria.data));
  const regraId = cria.data.id;

  // Só um pendente por cliente+carro+regra: o "saindo" vai sem carro.
  const inserir = async (carro, extra) => (await q(
    `INSERT INTO followup_fila (cliente_id, carro_id, regra_id, tipo, mensagem)
     VALUES ($1, $2, $3, 'reativacao', 'Texto antigo') RETURNING id`,
    [ctx.idsA.cliente, carro, regraId],
  ).then(async (rows) => { if (extra) await q(`UPDATE followup_fila SET ${extra} WHERE id = $1`, [rows[0].id]); return rows; }))[0].id;
  const enviado = await inserir(ctx.idsA.carro, "status = 'enviado', enviado_em = now()");
  const pendente = await inserir(ctx.idsA.carro);
  const saindo = await inserir(null, 'envio_iniciado_em = now()');

  const r = await api(`/api/followup/automacoes/${regraId}`, {
    method: 'PUT', body: { mensagem_template: 'Oi {nome_cliente}, e o {modelo_carro} ({placa})?' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.mensagens_atualizadas, 1);

  const msg = async (id) => (await q('SELECT mensagem FROM followup_fila WHERE id = $1', [id]))[0].mensagem;
  assert.match(await msg(pendente), /^Oi .+, e o VW Gol \(TAA1A11\)\?$/);
  assert.equal(await msg(saindo), 'Texto antigo', 'card saindo não muda');
  assert.equal(await msg(enviado), 'Texto antigo', 'card enviado não muda');

  // Salvar sem mudar o texto não mexe em nada.
  const igual = await api(`/api/followup/automacoes/${regraId}`, { method: 'PUT', body: { intervalo_dias: 120 } });
  assert.equal(igual.status, 200, JSON.stringify(igual.data));
  assert.equal(igual.data.mensagens_atualizadas, undefined);
});

test('cartão fixo também remonta os pendentes dele', async () => {
  await q('DELETE FROM followup_fila');
  const [{ id: regraId }] = await q("SELECT id FROM followup_regras WHERE chave = 'reativacao'");
  const [{ id }] = await q(
    `INSERT INTO followup_fila (cliente_id, regra_id, tipo, mensagem)
     VALUES ($1, $2, 'reativacao', 'Texto antigo') RETURNING id`, [ctx.idsA.cliente, regraId],
  );
  const r = await api('/api/followup/automacoes/reativacao', {
    method: 'PUT', body: { mensagem_template: 'Saudades, {nome_cliente}! Seu {modelo_carro} está bem?' },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.mensagens_atualizadas, 1);
  const [{ mensagem }] = await q('SELECT mensagem FROM followup_fila WHERE id = $1', [id]);
  assert.match(mensagem, /^Saudades, .+! Seu carro está bem\?$/);
});
