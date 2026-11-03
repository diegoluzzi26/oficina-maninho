'use strict';
/**
 * Catálogo de peças: semelhança de nomes e leitura da tabela NCM oficial.
 * Puro, sem banco nem rede.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/utils/semelhanca');
const ncm = require('../src/services/ncm.service');

test('chave ignora acento, caixa, plural e "de/do"', () => {
  assert.equal(s.chave('Lâmpadas'), s.chave('lampada'));
  assert.equal(s.chave('Sensor de Temperatura'), s.chave('sensor temperatura'));
  assert.equal(s.chave('Fusíveis'), s.chave('fusivel'));
  assert.equal(s.chave('Interruptor Ré'), s.chave('interruptor de re'));
  assert.notEqual(s.chave('Filtro de óleo'), s.chave('Filtro de ar'));
});

test('similar pega erro de digitação, mas medida diferente é outra peça', () => {
  assert.ok(s.similar('Fusível 20A', 'fuzivel 20a') >= s.LIMIAR);
  assert.equal(s.similar('Fusível 20A', 'Fusível 30A'), 0);
  assert.equal(s.similar('Lâmpada H4', 'lampada H7'), 0);
  assert.ok(s.similar('Bateria 60Ah', 'bateria 60 ah') >= s.LIMIAR);
  assert.ok(s.similar('Filtro de óleo', 'Filtro de ar') < s.LIMIAR);
});

test('agrupar junta só os parecidos, o mais usado primeiro', () => {
  const g = s.agrupar([
    { id: 1, nome: 'Lampadas', usos: 2 },
    { id: 2, nome: 'Lâmpada', usos: 9 },
    { id: 3, nome: 'Fusível 20A', usos: 1 },
    { id: 4, nome: 'Fusível 30A', usos: 1 },
    { id: 5, nome: 'Correia dentada', usos: 0 },
  ]);
  assert.deepEqual(g.map((x) => x.map((p) => p.id)), [[2, 1]]);
});

test('maisParecido devolve o item do catálogo ou null', () => {
  const cat = [{ id: 1, nome: 'Válvula termostática' }, { id: 2, nome: 'Correia dentada' }];
  assert.equal(s.maisParecido('valvula termostatica', cat).item.id, 1);
  assert.equal(s.maisParecido('pastilha', cat), null);
});

test('tabela NCM: só 8 dígitos vigentes, com descrição completa e sem HTML', () => {
  const json = {
    Nomenclaturas: [
      { Codigo: '87', Descricao: 'Veículos automóveis', Data_Fim: '31/12/9999' },
      { Codigo: '87.08', Descricao: 'Partes e acessórios', Data_Fim: '31/12/9999' },
      { Codigo: '8708.30', Descricao: '- Freios e servofreios; suas partes', Data_Fim: '31/12/9999' },
      { Codigo: '8708.30.90', Descricao: 'Outros', Data_Inicio: '01/04/2022', Data_Fim: '31/12/9999' },
      { Codigo: '8708.30.11', Descricao: 'Antigo', Data_Fim: '31/12/2023' },
      { Codigo: '8708.80.00', Descricao: '- Sistemas de <i>suspensão</i>', Data_Fim: '31/12/9999' },
    ],
  };
  const linhas = ncm.linhasDoJson(json, '2026-11-03');
  assert.deepEqual(linhas.map((l) => l.codigo), ['87083090', '87088000']);
  assert.equal(linhas[0].descricao_completa,
    'Veículos automóveis > Partes e acessórios > Freios e servofreios; suas partes > Outros');
  assert.equal(linhas[0].busca.includes('veiculos automoveis'), true);
  assert.equal(linhas[0].data_inicio, '2022-04-01');
  assert.equal(linhas[0].data_fim, null);
  assert.equal(linhas[1].descricao, 'Sistemas de suspensão');
});
