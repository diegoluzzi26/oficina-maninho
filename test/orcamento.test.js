'use strict';
/**
 * Orçamento em PDF (orcamento.service). Sem banco nem WhatsApp reais: testa
 * a geração pura do PDF e as travas do envio com dependências simuladas.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

// O db exige env ao carregar, mas estes testes não conectam.
process.env.DATABASE_URL ||= 'postgres://ninguem@127.0.0.1:1/sem_banco_test';
process.env.JWT_SECRET ||= 'teste-orcamento-sem-banco';

const db = require('../src/config/db');
const os = require('../src/services/os.service');
const wa = require('../src/services/whatsapp.service');
const orc = require('../src/services/orcamento.service');

const oficina = { slug: 'maninho', nome: 'Auto Elétrica Maninho', logo: null };

const ordem = {
  id: 'x', numero_os: 300, status: 'aberta', cliente_id: 'c',
  cliente_nome: 'Roberto Nunes Fonseca', cliente_telefone: '+5551998204064',
  marca: 'Ford', modelo: 'Ka', ano: null, placa: null, desconto: 0, valor_total: 1320,
  servicos: [{ nome_servico: 'Mão de obra', quantidade: 1, valor_total: 1000 }],
  pecas: [{ descricao: 'Junta do cabeçote', quantidade: 2, valor_total: 320 }],
};

const simular = (t, dados) => {
  t.mock.method(os, 'buscarPorId', async () => dados);
  t.mock.method(db, 'query', async () => ({ rows: [oficina] }));
  return t.mock.method(wa, 'enviarDocumento', async () => ({ id: 'FAKE' }));
};

test('itens saem na ordem serviços → peças, com quantidade própria', () => {
  assert.deepEqual(orc.montarItens(ordem), [
    { descricao: 'Mão de obra', quantidade: 1, valor: 1000 },
    { descricao: 'Junta do cabeçote', quantidade: 2, valor: 320 },
  ]);
});

test('garantia só sai para quem a oferece', () => {
  assert.ok(orc.condicoesDaOficina('maninho', null).some((c) => /Garantia/.test(c)));
  assert.deepEqual(orc.condicoesDaOficina('outra', null), []);
});

test('condições configuradas substituem as padrão, uma por linha', () => {
  assert.deepEqual(orc.condicoesDaOficina('maninho', ' Pix à vista \n\nGarantia de 6 meses'),
    ['Pix à vista', 'Garantia de 6 meses']);
});

test('hoje é calculado no fuso de Brasília', () => {
  // 01h UTC do dia 7 ainda é dia 6 em Brasília (UTC-3)
  assert.equal(orc.dataBR(orc.hojeSP(new Date('2026-11-07T01:00:00Z'))), '06/11/2026');
});

test('validade conta dias corridos a partir da emissão', () => {
  assert.equal(orc.dataBR(orc.somarDias(new Date('2026-11-06T00:00:00Z'), 7)), '13/11/2026');
});

test('gera PDF válido e quebra página com muitos itens', async () => {
  const base = { oficina, emissao: new Date('2026-11-06T00:00:00Z'), dias: 7, condicoes: [] };
  const pdf = await orc.renderizar({ ...base, ordem, itens: orc.montarItens(ordem) });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');

  const itens = Array.from({ length: 40 }, (_, i) => ({ descricao: `Peça ${i + 1}`, quantidade: 1, valor: 10 }));
  const grande = await orc.renderizar({ ...base, ordem, itens });
  const paginas = (grande.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.ok(paginas >= 2, `esperava 2+ páginas, veio ${paginas}`);
});

test('legenda usa primeiro nome, carro, total e validade', () => {
  const txt = orc.legendaWhatsApp({ ordem, oficina, validade: new Date('2026-11-13T00:00:00Z') });
  assert.match(txt, /^Olá, Roberto! Segue o orçamento da OS nº 300 do seu Ford Ka/);
  assert.match(txt, /R\$ 1\.320,00/);
  assert.match(txt, /13\/11\/2026/);
  assert.match(txt, /Auto Elétrica Maninho$/);
});

test('envio manda o PDF ao telefone do cliente', async (t) => {
  const envio = simular(t, ordem);
  const r = await orc.enviarWhatsApp('x', 'of');
  assert.equal(r.enviado, true);
  const arg = envio.mock.calls[0].arguments[0];
  assert.equal(arg.telefone, ordem.cliente_telefone);
  assert.equal(arg.arquivo.subarray(0, 5).toString(), '%PDF-');
});

test('OS paga não recebe orçamento', async (t) => {
  const envio = simular(t, { ...ordem, status: 'paga' });
  await assert.rejects(orc.enviarWhatsApp('x', 'of'), { statusCode: 409 });
  assert.equal(envio.mock.callCount(), 0);
});

test('OS sem itens não gera nem envia orçamento', async (t) => {
  const envio = simular(t, { ...ordem, servicos: [], pecas: [] });
  await assert.rejects(orc.enviarWhatsApp('x', 'of'), { statusCode: 422 });
  assert.equal(envio.mock.callCount(), 0);
});
