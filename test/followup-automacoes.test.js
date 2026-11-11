'use strict';
/**
 * Follow-up unificado: automações fixas, revisão a partir da agenda de
 * retornos, resposta e volta do cliente detectadas sozinhas, campanha e
 * resultados.
 *
 * Como rodar: ver test/README.md (exige TEST_DATABASE_URL num banco de teste).
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/tenancy');

let ctx;
let db;
let svc;

before(async () => {
  ctx = await setup();
  const aceite = await ctx.api('/api/contrato/aceitar', { method: 'POST', token: ctx.tokenA, body: {} });
  assert.ok(aceite.status < 300, `aceite do contrato: ${JSON.stringify(aceite.data)}`);
  db = require('../src/config/db');
  svc = require('../src/services/followup.service');
});
after(async () => { if (ctx) await ctx.teardown(); });

const A = (fn) => db.runComOficina('ta', fn);
const q = (sql, p) => A(() => db.query(sql, p)).then((r) => r.rows);
const api = (path, opt = {}) => ctx.api(path, { token: ctx.tokenA, ...opt });

beforeEach(async () => {
  await q('DELETE FROM followup_fila');
  await q('DELETE FROM retornos');
  await q(`DELETE FROM ordens_servico WHERE id <> $1`, [ctx.idsA.os]);
});

async function servicoComIntervalo() {
  const [s] = await q(
    `INSERT INTO servicos (nome, valor_padrao, intervalo_retorno_meses)
     VALUES ('Troca de óleo', 150, 6)
     ON CONFLICT DO NOTHING RETURNING id`,
  );
  return s?.id || (await q(`SELECT id FROM servicos WHERE nome = 'Troca de óleo'`))[0].id;
}

async function retorno({ dias, criadoHa = 0 }) {
  const servico = await servicoComIntervalo();
  const [r] = await q(
    `INSERT INTO retornos (cliente_id, carro_id, servico_id, nome_servico, agendado_para, motivo, criado_em)
     VALUES ($1, $2, $3, 'Troca de óleo', CURRENT_DATE + $4::int, 'Troca de óleo', now() - ($5::int || ' days')::interval)
     RETURNING id`, [ctx.idsA.cliente, ctx.idsA.carro, servico, dias, criadoHa],
  );
  return r.id;
}

test('automações: os quatro cartões existem mesmo em oficina nova', async () => {
  const r = await api('/api/followup/automacoes');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.automacoes.map((a) => a.chave), ['revisao', 'pos_servico', 'reativacao', 'campanha']);
  assert.equal(r.data.oficina, 'Oficina TA');

  const up = await api('/api/followup/automacoes/revisao', {
    method: 'PUT', body: { antecedencia_dias: 10, ativo: true },
  });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.antecedencia_dias, 10);
});

test('revisão: retorno vencendo entra na fila uma vez, com serviço e oficina na mensagem', async () => {
  await api('/api/followup/automacoes/revisao', { method: 'PUT', body: { antecedencia_dias: 7, ativo: true } });
  await retorno({ dias: 40, criadoHa: 10 }); // longe demais: não entra
  const vencendo = await retorno({ dias: 5 });

  const g = await api('/api/followup/gerar', { method: 'POST', body: { chave: 'revisao' } });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.gerados, 1);

  const [item] = await q('SELECT * FROM followup_fila');
  assert.equal(item.retorno_id, vencendo);
  assert.equal(item.tipo, 'manutencao');
  assert.match(item.mensagem, /Troca de óleo/);
  assert.match(item.mensagem, /Oficina TA/);
  assert.doesNotMatch(item.mensagem, /\{\w+\}/);

  const g2 = await api('/api/followup/gerar', { method: 'POST', body: { chave: 'revisao' } });
  assert.equal(g2.data.gerados, 0, 'não duplica');

  // Status do follow-up volta para o retorno.
  await api(`/api/followup/fila/${item.id}/status`, { method: 'PATCH', body: { status: 'enviado' } });
  const [ret] = await q('SELECT status FROM retornos WHERE id = $1', [vencendo]);
  assert.equal(ret.status, 'contatado');
});

test('revisão: retorno substituído por um mais novo do mesmo serviço não entra', async () => {
  await api('/api/followup/automacoes/revisao', { method: 'PUT', body: { antecedencia_dias: 7, ativo: true } });
  await retorno({ dias: 2, criadoHa: 200 }); // antigo, cliente já refez o serviço
  await retorno({ dias: 180, criadoHa: 0 }); // o novo, longe
  const g = await api('/api/followup/gerar', { method: 'POST', body: { chave: 'revisao' } });
  assert.equal(g.data.gerados, 0);
});

test('cliente respondeu no WhatsApp (número sem o 9): enviado vira respondeu', async () => {
  const [f] = await q(
    `INSERT INTO followup_fila (cliente_id, tipo, mensagem, status, enviado_em)
     VALUES ($1, 'manutencao', 'oi', 'enviado', now() - interval '1 day') RETURNING id`,
    [ctx.idsA.cliente],
  );
  // Cliente cadastrado como +5551999990001; WhatsApp antigo manda sem o 9.
  const wa = require('../src/services/whatsapp.service');
  await A(() => wa.processarWebhook({
    event: 'messages.upsert',
    data: { key: { remoteJid: '555199990001@s.whatsapp.net', fromMe: false, id: `IN-${Date.now()}` },
      message: { conversation: 'Quero marcar sim' } },
  }));
  const [item] = await q('SELECT status, respondido_em FROM followup_fila WHERE id = $1', [f.id]);
  assert.equal(item.status, 'respondeu');
  assert.ok(item.respondido_em);
});

test('cliente voltou: OS nova converte o enviado e dispensa revisão pendente', async () => {
  const [enviado] = await q(
    `INSERT INTO followup_fila (cliente_id, tipo, mensagem, status, enviado_em)
     VALUES ($1, 'reativacao', 'oi', 'enviado', now() - interval '3 days') RETURNING id`,
    [ctx.idsA.cliente],
  );
  const [pendente] = await q(
    `INSERT INTO followup_fila (cliente_id, carro_id, tipo, mensagem)
     VALUES ($1, $2, 'manutencao', 'revisão') RETURNING id`,
    [ctx.idsA.cliente, ctx.idsA.carro],
  );
  const [os] = await q(
    `INSERT INTO ordens_servico (cliente_id, carro_id) VALUES ($1, $2) RETURNING id, numero_os`,
    [ctx.idsA.cliente, ctx.idsA.carro],
  );
  const [a] = await q('SELECT status, convertido_os_id FROM followup_fila WHERE id = $1', [enviado.id]);
  assert.equal(a.status, 'converteu');
  assert.equal(a.convertido_os_id, os.id);
  const [b] = await q('SELECT status, notas FROM followup_fila WHERE id = $1', [pendente.id]);
  assert.equal(b.status, 'dispensado');
  assert.match(b.notas, new RegExp(`OS #${os.numero_os}`));
});

test('campanha: prévia conta o público e confirmar cria na fila', async () => {
  // O cliente de A tem uma OS (do harness), então é público da campanha.
  const previa = await api('/api/followup/campanha', { method: 'POST', body: {} });
  assert.equal(previa.status, 200, JSON.stringify(previa.data));
  assert.equal(previa.data.publico, 1);
  assert.equal((await q('SELECT count(*)::int AS n FROM followup_fila'))[0].n, 0);

  const ok = await api('/api/followup/campanha', {
    method: 'POST', body: { confirmar: true, mensagem: 'Olá {nome_cliente}! Promoção de ar-condicionado esta semana.' },
  });
  assert.equal(ok.data.gerados, 1);
  const [item] = await q('SELECT tipo, mensagem FROM followup_fila');
  assert.equal(item.tipo, 'promocao');
  assert.doesNotMatch(item.mensagem, /\{nome_cliente\}/);
});

test('resultados: enviados, responderam, voltaram e faturamento', async () => {
  const [os] = await q(
    `INSERT INTO ordens_servico (cliente_id, carro_id) VALUES ($1, $2) RETURNING id`,
    [ctx.idsA.cliente, ctx.idsA.carro],
  );
  await q(`UPDATE ordens_servico SET valor_total = 300 WHERE id = $1`, [os.id]);
  await q(
    `UPDATE ordens_servico SET status = 'paga', paga_em = now(), forma_pagamento = 'pix', valor_pago = 300
      WHERE id = $1`, [os.id],
  );
  await q(
    `INSERT INTO followup_fila (cliente_id, tipo, mensagem, status, enviado_em, respondido_em, convertido_os_id) VALUES
       ($1, 'manutencao', 'a', 'converteu', now(), now(), $2),
       ($1, 'manutencao', 'b', 'respondeu', now(), now(), NULL),
       ($1, 'reativacao', 'c', 'enviado',   now(), NULL,  NULL)`,
    [ctx.idsA.cliente, os.id],
  );
  const r = await api('/api/followup/resultados?meses=3');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.total, { enviados: 3, responderam: 2, voltaram: 1, faturamento: 300 });
  assert.equal(r.data.por_tipo.manutencao.voltaram, 1);
  assert.equal(r.data.por_mes.length, 1);
});
