'use strict';
/**
 * Consultor de IA com ferramentas: consulta os dados da oficina logada,
 * nunca os de outra, e ações (WhatsApp/follow-up) só voltam como proposta
 * — nada é gravado sem o usuário confirmar.
 *
 * A API do Claude é simulada trocando o `fetch` global só para
 * api.anthropic.com; o resto (chamadas ao app) passa pelo fetch real.
 * Como rodar: ver test/README.md (exige TEST_DATABASE_URL num banco de teste).
 */
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'chave-falsa-de-teste';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/tenancy');

let ctx;
let db;
let ferramentas;
const fetchReal = global.fetch;

// Fila de respostas que a "API do Claude" vai devolver, e o que ela recebeu.
let respostas;
let recebidos;

before(async () => {
  ctx = await setup();
  for (const token of [ctx.tokenA, ctx.tokenB]) {
    const aceite = await ctx.api('/api/contrato/aceitar', { method: 'POST', token, body: {} });
    assert.equal(aceite.status < 300, true, `aceite do contrato: ${JSON.stringify(aceite.data)}`);
  }
  db = require('../src/config/db');
  // /api/ia já é recurso do plano Completo; a oficina A precisa dele.
  await db.pool.query("UPDATE oficinas SET plano = 'completo' WHERE slug = 'ta'");
  ferramentas = require('../src/services/ia-ferramentas.service');
  global.fetch = async (url, opts) => {
    if (!String(url).startsWith('https://api.anthropic.com/')) return fetchReal(url, opts);
    recebidos.push(JSON.parse(opts.body));
    const corpo = typeof respostas[0] === 'function' ? respostas[0]() : respostas.shift();
    return new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
});
after(async () => {
  global.fetch = fetchReal;
  if (ctx) await ctx.teardown();
});
beforeEach(() => { respostas = []; recebidos = []; });

const naOficinaA = (fn) => db.runComOficina('ta', fn);
const usarFerramenta = (id, name, input) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
});
const texto = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });

async function contarFila(slug) {
  return db.runComOficina(slug, async () => {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM followup_fila');
    return rows[0].n;
  });
}

test('todas as ferramentas de consulta rodam no schema da oficina', async () => {
  const { idsA } = ctx;
  const casos = [
    ['buscar_clientes', { busca: 'Cliente ta' }],
    ['detalhes_cliente', { cliente_id: idsA.cliente }],
    ['historico_veiculo', { placa: 'TAA1A11' }],
    ['historico_veiculo', { carro_id: idsA.carro }],
    ['listar_ordens', { status: 'aberta' }],
    ['detalhes_ordem', { os_id: idsA.os }],
    ['painel_financeiro', {}],
    ['faturamento_periodo', {}],
    ['listar_despesas', {}],
    ['fila_followup', {}],
    ['metricas_followup', { periodo: 30 }],
  ];
  for (const [nome, entrada] of casos) {
    const r = await naOficinaA(() => ferramentas.executar(nome, entrada));
    assert.equal(r.erro, false, `${nome}: ${r.conteudo}`);
    assert.ok(r.conteudo.length > 0, nome);
  }
  const busca = JSON.parse((await naOficinaA(() => ferramentas.executar('buscar_clientes', { busca: 'Cliente ta' }))).conteudo);
  assert.equal(busca.clientes.length, 1);
  assert.equal(busca.clientes[0].id, idsA.cliente);
});

test('oficina A não enxerga dados da oficina B pelas ferramentas', async () => {
  const { idsB } = ctx;
  const busca = JSON.parse((await naOficinaA(() => ferramentas.executar('buscar_clientes', { busca: 'Cliente tb' }))).conteudo);
  assert.equal(busca.total, 0);

  for (const [nome, entrada] of [
    ['detalhes_cliente', { cliente_id: idsB.cliente }],
    ['detalhes_ordem', { os_id: idsB.os }],
    ['propor_followup', { cliente_id: idsB.cliente, tipo: 'manutencao', mensagem: 'Olá, hora da revisão!' }],
    ['propor_mensagem_whatsapp', { cliente_id: idsB.cliente, mensagem: 'Oi' }],
  ]) {
    const r = await naOficinaA(() => ferramentas.executar(nome, entrada));
    assert.equal(r.erro, true, `${nome} deveria falhar para id de outra oficina`);
    assert.equal(r.proposta, undefined);
  }
  const veic = JSON.parse((await naOficinaA(() => ferramentas.executar('historico_veiculo', { placa: 'TBB2B22' }))).conteudo);
  assert.equal(veic.encontrado, false);
});

test('erro de entrada vira resultado de erro, sem derrubar a conversa', async () => {
  const r1 = await naOficinaA(() => ferramentas.executar('detalhes_cliente', { cliente_id: 'nao-e-uuid' }));
  assert.equal(r1.erro, true);
  const r2 = await naOficinaA(() => ferramentas.executar('ferramenta_inexistente', {}));
  assert.equal(r2.erro, true);
});

test('conversa: consulta, propõe follow-up e não grava nada', async () => {
  const { idsA } = ctx;
  const antes = await contarFila('ta');
  respostas.push(
    usarFerramenta('t1', 'buscar_clientes', { busca: 'Cliente ta' }),
    usarFerramenta('t2', 'propor_followup', {
      cliente_id: idsA.cliente, carro_id: idsA.carro, tipo: 'manutencao',
      mensagem: 'Olá! Está na hora da revisão do seu Gol.', agendado_para: '2026-12-01',
    }),
    texto('Propus um follow-up de revisão para o Cliente ta.'),
  );

  const r = await ctx.api('/api/ia/conversar', {
    method: 'POST', token: ctx.tokenA,
    body: { mensagens: [{ role: 'user', content: 'Agenda a revisão do Cliente ta' }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.resposta, 'Propus um follow-up de revisão para o Cliente ta.');
  assert.deepEqual(r.data.consultas, ['buscar_clientes', 'propor_followup']);
  assert.equal(r.data.propostas.length, 1);
  const p = r.data.propostas[0];
  assert.equal(p.tipo, 'followup');
  assert.equal(p.cliente_id, idsA.cliente);
  assert.equal(p.carro_id, idsA.carro);
  assert.equal(p.agendado_para, '2026-12-01');

  // Nada foi gravado: a fila só muda quando o usuário confirma.
  assert.equal(await contarFila('ta'), antes);

  // O resultado da ferramenta voltou ao modelo com o mesmo tool_use_id.
  const ultima = recebidos[2].messages.at(-1);
  assert.equal(ultima.role, 'user');
  assert.equal(ultima.content[0].type, 'tool_result');
  assert.equal(ultima.content[0].tool_use_id, 't2');
  assert.ok(recebidos[0].tools.some((t) => t.name === 'propor_followup'));

  // Confirmar pela rota normal grava na fila.
  const confirma = await ctx.api('/api/followup/fila/manual', {
    method: 'POST', token: ctx.tokenA,
    body: { cliente_id: p.cliente_id, carro_id: p.carro_id, tipo: p.tipo_followup,
      mensagem: p.mensagem, agendado_para: p.agendado_para },
  });
  assert.equal(confirma.status, 201, JSON.stringify(confirma.data));
  assert.equal(await contarFila('ta'), antes + 1);
});

test('conversa: rascunho de WhatsApp traz número pronto pro wa.me', async () => {
  respostas.push(
    usarFerramenta('w1', 'propor_mensagem_whatsapp', { cliente_id: ctx.idsA.cliente, mensagem: 'Seu carro está pronto!' }),
    texto('Deixei a mensagem pronta.'),
  );
  const r = await ctx.api('/api/ia/conversar', {
    method: 'POST', token: ctx.tokenA,
    body: { mensagens: [{ role: 'user', content: 'Avisa o cliente que o carro está pronto' }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.propostas[0].tipo, 'whatsapp');
  assert.equal(r.data.propostas[0].numero_whatsapp, '5551999990001');
});

test('conversa: teto de consultas por pergunta força resposta em texto', async () => {
  let n = 0;
  // Modelo "teimoso": pede ferramenta sempre, até receber tool_choice none.
  respostas.push(() => {
    const ultimo = recebidos.at(-1);
    if (ultimo.tool_choice && ultimo.tool_choice.type === 'none') {
      respostas.shift();
      return texto('Resposta com o que deu pra consultar.');
    }
    n += 1;
    return usarFerramenta(`x${n}`, 'painel_financeiro', {});
  });
  const r = await ctx.api('/api/ia/conversar', {
    method: 'POST', token: ctx.tokenA,
    body: { mensagens: [{ role: 'user', content: 'Analisa tudo' }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.consultas.length, 8);
  assert.equal(r.data.resposta, 'Resposta com o que deu pra consultar.');
  assert.equal(recebidos.length, 9);
});

test('sem login não usa o consultor', async () => {
  // Sem token: 401; o requireRole('admin') das rotas /ia continua valendo.
  const r = await ctx.api('/api/ia/conversar', {
    method: 'POST', body: { mensagens: [{ role: 'user', content: 'oi' }] },
  });
  assert.equal(r.status, 401);
});
