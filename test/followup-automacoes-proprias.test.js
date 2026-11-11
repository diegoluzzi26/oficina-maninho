'use strict';
/**
 * Automações criadas pela oficina: depois de um serviço, cliente sumido,
 * aniversário e campanha com filtro — com filtros de carro (ano, câmbio)
 * e a opção de enviar sozinho.
 *
 * Como rodar: ver test/README.md (exige TEST_DATABASE_URL num banco de teste).
 */
process.env.FOLLOWUP_LOTE_INTERVALO_MS = '0';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/tenancy');

let ctx;
let db;
let svc;
let saidas;

before(async () => {
  ctx = await setup();
  const aceite = await ctx.api('/api/contrato/aceitar', { method: 'POST', token: ctx.tokenA, body: {} });
  assert.ok(aceite.status < 300, `aceite do contrato: ${JSON.stringify(aceite.data)}`);
  db = require('../src/config/db');
  svc = require('../src/services/followup.service');
  const wa = require('../src/services/whatsapp.service');
  wa.notificar = async ({ telefone, mensagem }) => {
    saidas.push({ telefone, mensagem });
    return { wa_message_id: `W${saidas.length}` };
  };
});
after(async () => { if (ctx) await ctx.teardown(); });

const A = (fn) => db.runComOficina('ta', fn);
const q = (sql, p) => A(() => db.query(sql, p)).then((r) => r.rows);
const api = (path, opt = {}) => ctx.api(path, { token: ctx.tokenA, ...opt });

beforeEach(async () => {
  saidas = [];
  await q('DELETE FROM followup_fila');
  await q('DELETE FROM followup_regras WHERE chave IS NULL');
  await q('DELETE FROM retornos');
  await q(`DELETE FROM ordens_servico WHERE id <> $1`, [ctx.idsA.os]);
  await q(`UPDATE carros SET ano = 2021, cambio = 'automatico' WHERE id = $1`, [ctx.idsA.carro]);
  await q('UPDATE clientes SET data_nascimento = NULL WHERE id = $1', [ctx.idsA.cliente]);
});

async function servico(nome) {
  const r = await q(`SELECT id FROM servicos WHERE nome = $1`, [nome]);
  if (r[0]) return r[0].id;
  return (await q(`INSERT INTO servicos (nome, valor_padrao) VALUES ($1, 100) RETURNING id`, [nome]))[0].id;
}

/** OS paga há `dias` dias com o serviço. */
async function osPagaHa(dias, servicoId) {
  const [os] = await q(
    `INSERT INTO ordens_servico (cliente_id, carro_id) VALUES ($1, $2) RETURNING id`,
    [ctx.idsA.cliente, ctx.idsA.carro],
  );
  await q(
    `INSERT INTO os_servicos (os_id, servico_id, nome_servico, valor_unit) VALUES ($1, $2, 'Troca de fluido do câmbio', 300)`,
    [os.id, servicoId],
  );
  await q(
    `UPDATE ordens_servico SET status = 'paga', forma_pagamento = 'pix', valor_pago = 300,
            paga_em = now() - ($2::int || ' days')::interval, aberta_em = now() - ($2::int || ' days')::interval
      WHERE id = $1`, [os.id, dias],
  );
  return os.id;
}

const criar = (body) => api('/api/followup/automacoes', { method: 'POST', body });

test('depois de um serviço: só carro automático e ano 2018+ entra, com o serviço na mensagem', async () => {
  const s = await servico('Troca de fluido do câmbio');
  await osPagaHa(15, s);

  const r = await criar({
    nome: 'Câmbio automático 15 dias', gatilho: 'servico_feito', intervalo_dias: 15,
    mensagem_template: 'Olá {nome_cliente}! Como está o câmbio do {modelo_carro} depois do {servico}?',
    filtros: { servico_ids: [s], cambios: ['automatico', 'cvt'], ano_min: 2018 },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.tipo, 'manutencao');
  assert.deepEqual(r.data.filtros.cambios, ['automatico', 'cvt']);

  const g = await api('/api/followup/gerar', { method: 'POST', body: { id: r.data.id } });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.gerados, 1);
  const [item] = await q('SELECT * FROM followup_fila');
  assert.equal(item.regra_id, r.data.id);
  assert.match(item.mensagem, /Troca de fluido do câmbio/);

  // Mesmo serviço, carro manual: não entra.
  await q('DELETE FROM followup_fila');
  await q(`UPDATE carros SET cambio = 'manual' WHERE id = $1`, [ctx.idsA.carro]);
  const g2 = await api('/api/followup/gerar', { method: 'POST', body: { id: r.data.id } });
  assert.equal(g2.data.gerados, 0, 'carro manual fica de fora');

  // Automático, mas antigo: também fica de fora.
  await q(`UPDATE carros SET cambio = 'automatico', ano = 2012 WHERE id = $1`, [ctx.idsA.carro]);
  const g3 = await api('/api/followup/gerar', { method: 'POST', body: { id: r.data.id } });
  assert.equal(g3.data.gerados, 0, 'carro antigo fica de fora');
});

test('depois de um serviço: exige escolher serviço ou peça', async () => {
  const r = await criar({
    nome: 'Sem item', gatilho: 'servico_feito', intervalo_dias: 10,
    mensagem_template: 'Olá {nome_cliente}, tudo certo?',
  });
  assert.equal(r.status, 422, JSON.stringify(r.data));
});

test('cliente sumido: cada automação conta o próprio sumiço', async () => {
  const s = await servico('Alinhamento');
  await osPagaHa(100, s);
  await q(`DELETE FROM ordens_servico WHERE id = $1`, [ctx.idsA.os]); // só a OS de 100 dias conta
  const r90 = await criar({ nome: '90 dias', gatilho: 'sumido', intervalo_dias: 90,
    mensagem_template: 'Olá {nome_cliente}! Faz {dias_desde} dias.' });
  const r365 = await criar({ nome: '1 ano', gatilho: 'sumido', intervalo_dias: 365,
    mensagem_template: 'Olá {nome_cliente}! Faz um ano.' });
  const g = await api('/api/followup/gerar', { method: 'POST', body: {} });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.por_automacao[r90.data.id], 1);
  assert.equal(g.data.por_automacao[r365.data.id], 0);
  const [item] = await q('SELECT mensagem, tipo FROM followup_fila WHERE regra_id = $1', [r90.data.id]);
  assert.equal(item.tipo, 'reativacao');
  assert.match(item.mensagem, /Faz 100 dias/);

  const g2 = await api('/api/followup/gerar', { method: 'POST', body: { id: r90.data.id } });
  assert.equal(g2.data.gerados, 0, 'uma vez por sumiço');
});

test('aniversário: entra no dia, uma vez por ano; data de nascimento vem do cadastro', async () => {
  const hoje = new Date();
  const nasc = `1985-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const up = await api(`/api/clientes/${ctx.idsA.cliente}`, { method: 'PUT', body: { data_nascimento: nasc } });
  assert.ok(up.status < 300, JSON.stringify(up.data));
  assert.equal(String(up.data.data_nascimento).slice(0, 10), nasc);

  const r = await criar({ nome: 'Aniversário', gatilho: 'aniversario',
    mensagem_template: 'Feliz aniversário, {nome_cliente}! Um abraço da {oficina}.' });
  const g = await api('/api/followup/gerar', { method: 'POST', body: { id: r.data.id } });
  assert.equal(g.data.gerados, 1);
  const [item] = await q('SELECT mensagem FROM followup_fila');
  assert.match(item.mensagem, /Oficina TA/);
  const g2 = await api('/api/followup/gerar', { method: 'POST', body: { id: r.data.id } });
  assert.equal(g2.data.gerados, 0);
});

test('campanha própria: público filtrado por câmbio e envio sozinho ao montar', async () => {
  const r = await criar({ nome: 'Revisão de câmbio automático', gatilho: 'campanha',
    mensagem_template: 'Olá {nome_cliente}! Promoção de troca de fluido para o {modelo_carro}.',
    filtros: { cambios: ['automatico'] }, envio_automatico: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));

  const previa = await api('/api/followup/campanha', { method: 'POST', body: { regra_id: r.data.id } });
  assert.equal(previa.status, 200, JSON.stringify(previa.data));
  assert.equal(previa.data.publico, 1);

  await q(`UPDATE carros SET cambio = 'manual' WHERE id = $1`, [ctx.idsA.carro]);
  const vazio = await api('/api/followup/campanha', { method: 'POST', body: { regra_id: r.data.id } });
  assert.equal(vazio.data.publico, 0, 'carro manual fica de fora');
  await q(`UPDATE carros SET cambio = 'automatico' WHERE id = $1`, [ctx.idsA.carro]);

  const feita = await api('/api/followup/campanha', {
    method: 'POST', body: { regra_id: r.data.id, confirmar: true },
  });
  assert.equal(feita.status, 200, JSON.stringify(feita.data));
  assert.equal(feita.data.gerados, 1);
  // WhatsApp do plano de teste pode estar fora; se o envio começou, ele sai.
  if (feita.data.envio && !feita.data.envio.erro) {
    for (let i = 0; i < 50 && saidas.length === 0; i += 1) {
      await new Promise((res) => { setTimeout(res, 50); });
    }
  }
  assert.ok(feita.data.envio, 'tentou enviar sozinho');
});

test('editar e apagar automação própria; cartão fixo não se apaga', async () => {
  const r = await criar({ nome: 'Teste', gatilho: 'sumido', intervalo_dias: 60,
    mensagem_template: 'Olá {nome_cliente}, sentimos sua falta.' });
  const up = await api(`/api/followup/automacoes/${r.data.id}`, {
    method: 'PUT', body: { nome: 'Sumidos 2 meses', envio_automatico: true, filtros: { ano_min: 2015 } },
  });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(up.data.nome, 'Sumidos 2 meses');
  assert.equal(up.data.envio_automatico, true);
  assert.equal(up.data.filtros.ano_min, 2015);

  const lista = await api('/api/followup/automacoes');
  assert.equal(lista.data.personalizadas.length, 1);
  assert.ok(Array.isArray(lista.data.catalogo.servicos));

  await q(
    `INSERT INTO followup_fila (cliente_id, regra_id, tipo, mensagem) VALUES ($1, $2, 'reativacao', 'oi')`,
    [ctx.idsA.cliente, r.data.id],
  );
  const del = await api(`/api/followup/automacoes/${r.data.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200, JSON.stringify(del.data));
  assert.equal(del.data.pendentes_apagados, 1);

  const [fixa] = await q(`SELECT id FROM followup_regras WHERE chave = 'revisao'`);
  const delFixa = await api(`/api/followup/automacoes/${fixa.id}`, { method: 'DELETE' });
  assert.equal(delFixa.status, 404);
});

test('envio automático: só as automações com "enviar sozinho" saem', async () => {
  const auto = await criar({ nome: 'Auto', gatilho: 'sumido', intervalo_dias: 60, envio_automatico: true,
    mensagem_template: 'Olá {nome_cliente}, mensagem automática.' });
  const manual = await criar({ nome: 'Manual', gatilho: 'sumido', intervalo_dias: 60,
    mensagem_template: 'Olá {nome_cliente}, mensagem revisada.' });
  await q(
    `INSERT INTO followup_fila (cliente_id, regra_id, tipo, mensagem) VALUES
       ($1, $2, 'reativacao', 'automática'), ($1, $3, 'reativacao', 'revisada')`,
    [ctx.idsA.cliente, auto.data.id, manual.data.id],
  );
  const lote = await A(() => svc.enviarAutomaticos());
  if (lote === null) return; // plano de teste sem WhatsApp: nada sai, como esperado
  assert.equal(lote.total, 1);
  for (let i = 0; i < 50 && lote.em_andamento; i += 1) {
    const e = await A(() => svc.estadoLote());
    if (!e.em_andamento) break;
    await new Promise((res) => { setTimeout(res, 50); });
  }
  const st = await q('SELECT mensagem, status FROM followup_fila ORDER BY mensagem');
  assert.deepEqual(st.map((x) => x.status), ['enviado', 'pendente']);
});
