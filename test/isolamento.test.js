'use strict';
/**
 * Testes de isolamento multi-oficina (ETAPA 2 — "isolamento garantido").
 *
 * Prova que o usuário da oficina A não LÊ, EDITA nem EXCLUI registro da
 * oficina B — nem pelo id direto na URL, nem via listagens, financeiro,
 * anexos, histórico de WhatsApp e relatórios.
 *
 * Como rodar: ver test/README.md (exige TEST_DATABASE_URL num banco de teste).
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers/tenancy');

let ctx;

before(async () => { ctx = await setup(); });
after(async () => { if (ctx) await ctx.teardown(); });

// Atalhos: A é o "atacante", tenta alcançar recursos de B.
const A = () => ctx.tokenA;
const idB = (k) => ctx.idsB[k];
const idA = (k) => ctx.idsA[k];

describe('leitura por id direto na URL', () => {
  test('não lê cliente de B', async () => {
    const r = await ctx.api(`/api/clientes/${idB('cliente')}`, { token: A() });
    assert.equal(r.status, 404);
  });

  test('não lê OS de B', async () => {
    const r = await ctx.api(`/api/os/${idB('os')}`, { token: A() });
    assert.equal(r.status, 404);
  });

  test('não lê despesa de B', async () => {
    const r = await ctx.api(`/api/despesas/${idB('despesa')}`, { token: A() });
    assert.equal(r.status, 404);
  });

  test('não lê fornecedor de B', async () => {
    const r = await ctx.api(`/api/fornecedores/${idB('fornecedor')}`, { token: A() });
    assert.equal(r.status, 404);
  });

  test('não baixa anexo de B', async () => {
    const r = await ctx.api(`/api/anexos/${idB('anexo')}`, { token: A() });
    assert.equal(r.status, 404);
  });

  test('lê o próprio cliente (sanidade — o 404 não é geral)', async () => {
    const r = await ctx.api(`/api/clientes/${idA('cliente')}`, { token: A() });
    assert.equal(r.status, 200);
    assert.equal(r.data.id, idA('cliente'));
  });
});

describe('listagens não vazam registros de B', () => {
  test('lista de clientes de A não contém o cliente de B', async () => {
    const r = await ctx.api('/api/clientes?por_pagina=100', { token: A() });
    assert.equal(r.status, 200);
    const ids = r.data.dados.map((c) => c.id);
    assert.ok(ids.includes(idA('cliente')), 'deveria conter o cliente da própria oficina');
    assert.ok(!ids.includes(idB('cliente')), 'NÃO pode conter o cliente da oficina B');
  });

  test('lista de OS de A não contém a OS de B', async () => {
    const r = await ctx.api('/api/os?por_pagina=100', { token: A() });
    assert.equal(r.status, 200);
    const ids = r.data.dados.map((o) => o.id);
    assert.ok(!ids.includes(idB('os')));
  });

  test('lista de despesas de A não contém a despesa de B', async () => {
    const r = await ctx.api('/api/despesas?por_pagina=100', { token: A() });
    assert.equal(r.status, 200);
    const ids = r.data.dados.map((d) => d.id);
    assert.ok(!ids.includes(idB('despesa')));
  });

  test('histórico de WhatsApp de A não contém mensagem de B', async () => {
    const r = await ctx.api('/api/whatsapp/mensagens', { token: A() });
    assert.equal(r.status, 200, 'a rota precisa rodar com contexto de oficina');
    const ids = r.data.map((m) => m.id);
    const tels = r.data.map((m) => m.telefone);
    assert.ok(!ids.includes(idB('wa')), 'NÃO pode conter mensagem da oficina B');
    assert.ok(!tels.includes(ctx.idsB.telefone), 'NÃO pode expor telefone da oficina B');
  });
});

describe('edição por id direto na URL', () => {
  test('não edita cliente de B', async () => {
    const r = await ctx.api(`/api/clientes/${idB('cliente')}`, {
      method: 'PUT', token: A(), body: { observacoes: 'invadido' },
    });
    assert.equal(r.status, 404);
  });

  test('não edita OS de B', async () => {
    const r = await ctx.api(`/api/os/${idB('os')}`, {
      method: 'PUT', token: A(), body: { observacoes: 'invadido' },
    });
    assert.equal(r.status, 404);
  });

  test('não edita despesa de B', async () => {
    const r = await ctx.api(`/api/despesas/${idB('despesa')}`, {
      method: 'PUT', token: A(), body: { descricao: 'invadida' },
    });
    assert.equal(r.status, 404);
  });
});

describe('exclusão por id direto na URL', () => {
  test('não exclui cliente de B', async () => {
    const r = await ctx.api(`/api/clientes/${idB('cliente')}`, { method: 'DELETE', token: A() });
    assert.equal(r.status, 404);
  });

  test('não exclui OS de B', async () => {
    const r = await ctx.api(`/api/os/${idB('os')}`, { method: 'DELETE', token: A() });
    assert.equal(r.status, 404);
  });

  test('não exclui despesa de B', async () => {
    const r = await ctx.api(`/api/despesas/${idB('despesa')}`, { method: 'DELETE', token: A() });
    assert.equal(r.status, 404);
  });

  test('o registro de B continua intacto após as tentativas', async () => {
    const r = await ctx.api(`/api/clientes/${idB('cliente')}`, { token: ctx.tokenB });
    assert.equal(r.status, 200);
    assert.equal(r.data.id, idB('cliente'));
  });
});

describe('relatórios não somam faturamento de outra oficina', () => {
  test('A (sem OS paga) fatura 0; B (com OS paga) fatura > 0', async () => {
    const ra = await ctx.api('/api/relatorios/dashboard', { token: A() });
    const rb = await ctx.api('/api/relatorios/dashboard', { token: ctx.tokenB });
    assert.equal(ra.status, 200);
    assert.equal(rb.status, 200);
    assert.equal(ra.data.resumo.faturamento, 0, 'A não tem OS paga — não pode herdar faturamento de B');
    assert.ok(rb.data.resumo.faturamento > 0, 'B tem OS paga — deve faturar');
  });
});
