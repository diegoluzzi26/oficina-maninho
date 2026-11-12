'use strict';
/**
 * Fila do follow-up: card que não tem como enviar fica marcado (falha de
 * envio ou número sem WhatsApp), e dá para excluir/dispensar vários.
 *
 * Como rodar: ver test/README.md (exige TEST_DATABASE_URL num banco de teste).
 */
process.env.FOLLOWUP_LOTE_INTERVALO_MS = '0';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/tenancy');

let ctx;
let db;
let wa;
let recusar;

before(async () => {
  ctx = await setup();
  const aceite = await ctx.api('/api/contrato/aceitar', { method: 'POST', token: ctx.tokenA, body: {} });
  assert.ok(aceite.status < 300, `aceite do contrato: ${JSON.stringify(aceite.data)}`);
  db = require('../src/config/db');
  wa = require('../src/services/whatsapp.service');
  wa.notificar = async () => {
    if (recusar) throw new Error('Falha ao enviar WhatsApp: o número (51) 99999-0001 não tem WhatsApp (tentado com e sem o 9)');
    return { wa_message_id: 'W1' };
  };
});
after(async () => { if (ctx) await ctx.teardown(); });

const A = (fn) => db.runComOficina('ta', fn);
const q = (sql, p) => A(() => db.query(sql, p)).then((r) => r.rows);
const api = (path, opt = {}) => ctx.api(path, { token: ctx.tokenA, ...opt });

beforeEach(async () => {
  recusar = false;
  await q('DELETE FROM followup_fila');
});

async function pendente(msg = 'Olá! Hora da revisão.') {
  const r = await api('/api/followup/fila/manual', {
    method: 'POST', body: { cliente_id: ctx.idsA.cliente, tipo: 'manutencao', mensagem: msg },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}

const cardNoKanban = async (id) => {
  const k = await api('/api/followup/kanban');
  assert.equal(k.status, 200, JSON.stringify(k.data));
  return Object.values(k.data.colunas).flat().find((i) => i.id === id);
};

test('envio que falha fica marcado no card com o motivo; reagendar limpa', async () => {
  const id = await pendente();
  recusar = true;
  const env = await api(`/api/followup/fila/${id}/enviar`, { method: 'POST', body: {} });
  assert.ok(env.status >= 400);

  const card = await cardNoKanban(id);
  assert.equal(card.status, 'pendente');
  assert.equal(card.problema, 'falha_envio');
  assert.match(card.problema_motivo, /não tem WhatsApp/);

  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await api(`/api/followup/fila/${id}/reagendar`, { method: 'PATCH', body: { agendado_para: amanha } });
  assert.equal((await cardNoKanban(id)).problema, null);
});

test('excluir e dispensar vários de uma vez', async () => {
  const a = await pendente('mensagem a');
  const b = await pendente('mensagem b');
  const c = await pendente('mensagem c');

  const disp = await api('/api/followup/fila/em-lote', { method: 'POST', body: { ids: [a], acao: 'dispensar' } });
  assert.equal(disp.status, 200, JSON.stringify(disp.data));
  assert.equal(disp.data.afetados, 1);
  assert.equal((await cardNoKanban(a)).status, 'dispensado');

  // Item no meio do envio não se apaga.
  await q('UPDATE followup_fila SET envio_iniciado_em = now() WHERE id = $1', [c]);
  const exc = await api('/api/followup/fila/em-lote', { method: 'POST', body: { ids: [b, c], acao: 'excluir' } });
  assert.equal(exc.data.afetados, 1);
  const sobra = await q('SELECT id FROM followup_fila ORDER BY id');
  assert.deepEqual(sobra.map((r) => r.id).sort(), [a, c].sort());

  const vazio = await api('/api/followup/fila/em-lote', { method: 'POST', body: { ids: [], acao: 'excluir' } });
  assert.equal(vazio.status, 422);
});

test('verificar números: quem não tem WhatsApp fica marcado, quem tem limpa a marca', async () => {
  const config = require('../src/services/config.service');
  const assinatura = require('../src/services/assinatura.service');
  const orig = { fetch: global.fetch, cfg: config.whatsapp, rec: assinatura.recursoNaOficinaAtual };
  config.whatsapp = () => ({ enabled: true, url: 'http://evo', apiKey: 'k', instance: 'ta' });
  assinatura.recursoNaOficinaAtual = async () => true;
  let existe = false;
  const pedidos = [];
  global.fetch = async (url, opt) => {
    if (!String(url).startsWith('http://evo')) return orig.fetch(url, opt); // chamadas à API do teste
    assert.match(url, /\/chat\/whatsappNumbers\/ta$/);
    const { numbers } = JSON.parse(opt.body);
    pedidos.push(numbers);
    return { ok: true, status: 200, json: async () => numbers.map((n) => ({ number: n, exists: existe && n === '555199990001' })) };
  };
  try {
    const id = await pendente();
    const r = await api('/api/followup/fila/verificar-numeros', { method: 'POST', body: {} });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.sem_whatsapp, 1);
    assert.deepEqual(pedidos[0].sort(), ['555199990001', '5551999990001'].sort(), 'pergunta com e sem o 9');
    assert.equal((await cardNoKanban(id)).problema, 'sem_whatsapp');

    existe = true; // só a forma sem o 9 existe
    const r2 = await api('/api/followup/fila/verificar-numeros', { method: 'POST', body: {} });
    assert.equal(r2.data.com_whatsapp, 1);
    assert.equal((await cardNoKanban(id)).problema, null);
  } finally {
    global.fetch = orig.fetch;
    config.whatsapp = orig.cfg;
    assinatura.recursoNaOficinaAtual = orig.rec;
  }
});
