'use strict';
/**
 * Orçamento em PDF (orcamento.service). Não precisa de banco: testa a
 * geração pura do PDF, a ordem dos itens, as datas e a legenda.
 */
const test = require('node:test');
const assert = require('node:assert');

// O service importa o db (que exige env), mas estes testes não conectam.
process.env.DATABASE_URL ||= 'postgres://ninguem@127.0.0.1:1/sem_banco_test';
process.env.JWT_SECRET ||= 'teste-orcamento-sem-banco';
const orc = require('../src/services/orcamento.service');

const oficina = {
  nome: 'Auto Elétrica Maninho', cor_primaria: '#283090', cor_secundaria: '#d4a843',
  endereco: 'RS-020, 1055', cidade: 'Gravataí', uf: 'RS', telefone: '(51) 99658-7778',
  especialidades: 'Elétrica · Injeção · Ar-condicionado', logo: null, logo_mime: null,
};

const ordem = {
  id: 'x', numero_os: 300, status: 'aberta',
  cliente_nome: 'Roberto Nunes Fonseca', cliente_telefone: '+5551998204064',
  marca: 'Ford', modelo: 'Ka', ano: null, placa: null, desconto: 0, valor_total: 6060,
  servicos: [
    { nome_servico: 'Mão de obra', quantidade: 1, valor_total: 1000 },
    { nome_servico: 'Retífica do cabeçote', quantidade: 1, valor_total: 2100 },
  ],
  pecas: [
    { descricao: 'Junta do cabeçote', quantidade: 1, valor_total: 320 },
    { descricao: 'Kit correia dentada', quantidade: 1, valor_total: 880 },
    { descricao: 'Óleo do câmbio', quantidade: 1, valor_total: 1380 },
    { descricao: 'Óleo do motor', quantidade: 1, valor_total: 380 },
  ],
};

test('itens saem na ordem serviços → peças e somam o total da OS', () => {
  const itens = orc.itensDaOS(ordem);
  assert.deepStrictEqual(itens.map((i) => i.descricao), [
    'Mão de obra', 'Retífica do cabeçote', 'Junta do cabeçote',
    'Kit correia dentada', 'Óleo do câmbio', 'Óleo do motor',
  ]);
  assert.strictEqual(itens.reduce((s, i) => s + i.total, 0), ordem.valor_total);
});

test('validade conta dias corridos a partir da emissão', () => {
  const emissao = new Date(Date.UTC(2026, 10, 6));
  assert.strictEqual(orc.dataBR(orc.somarDias(emissao, 7)), '13/11/2026');
});

test('hoje é calculado no fuso de Brasília', () => {
  // 01h UTC do dia 7 ainda é dia 6 em Brasília (UTC-3)
  const d = orc.hojeBrasil(new Date('2026-11-07T01:00:00Z'));
  assert.strictEqual(orc.dataBR(d), '06/11/2026');
});

test('gera um PDF A4 válido, inclusive com muitos itens (quebra de página)', async () => {
  const pdf = await orc.gerarPdf({ oficina, ordem, emitidoEm: new Date(Date.UTC(2026, 10, 6)) });
  assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-');

  const muitas = { ...ordem, pecas: Array.from({ length: 40 }, (_, i) => (
    { descricao: `Peça ${i + 1}`, quantidade: 2, valor_total: 10 })) };
  const grande = await orc.gerarPdf({ oficina, ordem: muitas });
  const paginas = (grande.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.ok(paginas >= 2, `esperava 2+ páginas, veio ${paginas}`);
});

test('legenda do WhatsApp usa primeiro nome, carro, total e validade', () => {
  const txt = orc.legendaWhatsApp({ ordem, oficina, validade: new Date(Date.UTC(2026, 10, 13)) });
  assert.match(txt, /^Olá, Roberto! Segue o orçamento da OS nº 300 do seu Ford Ka/);
  assert.match(txt, /R\$ 6\.060,00/);
  assert.match(txt, /13\/11\/2026/);
  assert.match(txt, /Auto Elétrica Maninho$/);
});
