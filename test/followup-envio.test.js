'use strict';
/**
 * Envio de follow-up pelo WhatsApp: trava contra reenvio, lote em segundo
 * plano e conferência na Evolution.
 *
 * Bug original: no "Enviar pendentes", a Evolution demorava >15s para
 * responder, a mensagem saía mas o item seguia 'pendente' — e um novo
 * clique reenviava para o cliente.
 *
 * A Evolution é simulada trocando as funções do whatsapp.service.
 * Como rodar: ver test/README.md (exige TEST_DATABASE_URL num banco de teste).
 */
process.env.FOLLOWUP_LOTE_INTERVALO_MS = '0';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/tenancy');

let ctx;
let wa;
let db;
const MSG = 'Olá! Hora da revisão do seu carro.';

// Evolution falsa: guarda o que "saiu" e decide como responder.
let saidas;       // [{ telefone, texto, em }]
let modoEnvio;    // 'ok' | 'timeout' | 'recusa'

before(async () => {
  ctx = await setup();
  const aceite = await ctx.api('/api/contrato/aceitar', { method: 'POST', token: ctx.tokenA, body: {} });
  assert.equal(aceite.status < 300, true, `aceite do contrato: ${JSON.stringify(aceite.data)}`);
  wa = require('../src/services/whatsapp.service');
  db = require('../src/config/db');
  wa.notificar = async ({ telefone, mensagem }) => {
    if (modoEnvio === 'recusa') {
      throw new Error('Falha ao enviar WhatsApp: número inválido');
    }
    saidas.push({ telefone, texto: mensagem, em: new Date() });
    if (modoEnvio === 'timeout') {
      const e = new Error('Evolution API não respondeu em 15s');
      e.envioIncerto = true;
      throw e;
    }
    return { wa_message_id: `W${saidas.length}` };
  };
  wa.enviadasPara = async (telefone, desde) => saidas
    .filter((s) => s.telefone === telefone && s.em >= desde)
    .map((s, i) => ({ id: `W${i}`, texto: s.texto, em: s.em }));
});
after(async () => { if (ctx) await ctx.teardown(); });

const naOficinaA = (fn) => db.runComOficina('ta', fn);

async function criarPendente() {
  const r = await ctx.api('/api/followup/fila/manual', {
    method: 'POST', token: ctx.tokenA,
    body: { cliente_id: ctx.idsA.cliente, tipo: 'manutencao', mensagem: MSG },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}

const item = (id) => ctx.api(`/api/followup/fila/${id}`, { token: ctx.tokenA }).then((r) => r.data);

async function esperarLote() {
  for (let i = 0; i < 100; i += 1) {
    const r = await ctx.api('/api/followup/fila/envio-lote', { token: ctx.tokenA });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    if (r.data && !r.data.em_andamento) return r.data;
    await new Promise((res) => { setTimeout(res, 50); });
  }
  throw new Error('lote não terminou');
}

beforeEach(async () => {
  saidas = [];
  modoEnvio = 'ok';
  await naOficinaA(() => db.query('DELETE FROM followup_fila'));
});

test('lote responde 202 na hora e marca como enviado', async () => {
  const id = await criarPendente();
  const r = await ctx.api('/api/followup/fila/enviar-pendentes', {
    method: 'POST', token: ctx.tokenA, body: { ids: [id] },
  });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  assert.equal(r.data.total, 1);
  const fim = await esperarLote();
  assert.equal(fim.enviados, 1);
  const it = await item(id);
  assert.equal(it.status, 'enviado');
  assert.equal(it.envio_iniciado_em, null);
});

test('timeout da Evolution não deixa reenviar e a conferência confirma', async () => {
  modoEnvio = 'timeout';
  const id = await criarPendente();
  await ctx.api('/api/followup/fila/enviar-pendentes', {
    method: 'POST', token: ctx.tokenA, body: { ids: [id] },
  });
  const fim = await esperarLote();
  assert.equal(fim.incertos, 1);
  assert.equal(fim.falhas.length, 0);
  assert.equal(saidas.length, 1, 'a mensagem saiu uma vez');

  let it = await item(id);
  assert.equal(it.status, 'pendente');
  assert.ok(it.envio_iniciado_em, 'fica travado como "enviando"');

  // Novo lote e envio individual não reenviam.
  modoEnvio = 'ok';
  const lote2 = await ctx.api('/api/followup/fila/enviar-pendentes', {
    method: 'POST', token: ctx.tokenA, body: {},
  });
  assert.equal(lote2.data.total, 0);
  const individual = await ctx.api(`/api/followup/fila/${id}/enviar`, {
    method: 'POST', token: ctx.tokenA, body: {},
  });
  assert.equal(individual.status, 409);
  assert.equal(saidas.length, 1, 'nada foi reenviado');

  // Conferência automática pega travas com 2+ min.
  await naOficinaA(() => db.query(
    "UPDATE followup_fila SET envio_iniciado_em = now() - interval '3 minutes' WHERE id=$1", [id],
  ));
  saidas[0].em = new Date(Date.now() - 3 * 60000);
  const r = await naOficinaA(() => require('../src/services/followup.service').conferirEnvios({}, null));
  assert.equal(r.confirmados, 1);
  it = await item(id);
  assert.equal(it.status, 'enviado');
  assert.equal(it.envio_iniciado_em, null);
});

test('recusa da Evolution solta a trava para tentar de novo', async () => {
  modoEnvio = 'recusa';
  const id = await criarPendente();
  await ctx.api('/api/followup/fila/enviar-pendentes', {
    method: 'POST', token: ctx.tokenA, body: { ids: [id] },
  });
  const fim = await esperarLote();
  assert.equal(fim.falhas.length, 1);
  const it = await item(id);
  assert.equal(it.status, 'pendente');
  assert.equal(it.envio_iniciado_em, null);
});

test('trava sem mensagem na Evolution há 30+ min é liberada', async () => {
  const id = await criarPendente();
  await naOficinaA(() => db.query(
    "UPDATE followup_fila SET envio_iniciado_em = now() - interval '40 minutes' WHERE id=$1", [id],
  ));
  const r = await naOficinaA(() => require('../src/services/followup.service').conferirEnvios({}, null));
  assert.equal(r.liberados, 1);
  const it = await item(id);
  assert.equal(it.status, 'pendente');
  assert.equal(it.envio_iniciado_em, null);
});

test('"Conferir no WhatsApp" acerta pendentes que já tinham saído', async () => {
  // Caso dos 100: mensagem saiu antes da correção e o item ficou pendente.
  const jaSaiu = await criarPendente();
  const naoSaiu = await criarPendente();
  await naOficinaA(() => db.query(
    "UPDATE followup_fila SET mensagem = 'outra mensagem' WHERE id=$1", [naoSaiu],
  ));
  saidas.push({ telefone: '+5551999990001', texto: `  ${MSG.replace(' ', '\n')} `, em: new Date() });

  const r = await ctx.api('/api/followup/fila/conferir-envios', {
    method: 'POST', token: ctx.tokenA, body: { todosPendentes: true },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.conferidos, 2);
  assert.equal(r.data.confirmados, 1);
  assert.equal((await item(jaSaiu)).status, 'enviado');
  assert.equal((await item(naoSaiu)).status, 'pendente');
});
