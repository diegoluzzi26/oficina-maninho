'use strict';
/**
 * Regras de plano + adicionais (src/config/planos.js). Puro, sem banco.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const planos = require('../src/config/planos');

test('adicional fiscal libera o recurso nos planos compatíveis', () => {
  assert.equal(planos.temRecurso('profissional', 'fiscal', ['fiscal']), true);
  assert.equal(planos.temRecurso('completo', 'fiscal', ['fiscal']), true);
});

test('sem o adicional, nenhum plano libera fiscal', () => {
  for (const p of planos.ORDEM) assert.equal(planos.temRecurso(p, 'fiscal', []), false);
  assert.equal(planos.temRecurso('completo', 'fiscal'), false);
});

test('no Essencial o adicional fica inativo: não libera nem cobra', () => {
  assert.equal(planos.temRecurso('essencial', 'fiscal', ['fiscal']), false);
  assert.deepEqual(planos.adicionaisAtivos('essencial', ['fiscal']), []);
  assert.equal(planos.valorAssinatura('essencial', ['fiscal'], 'mensal'), 59);
});

test('valor da assinatura soma plano + adicionais ativos', () => {
  assert.equal(planos.valorAssinatura('profissional', [], 'mensal'), 119);
  assert.equal(planos.valorAssinatura('profissional', ['fiscal'], 'mensal'), 158);
  assert.equal(planos.valorAssinatura('completo', ['fiscal'], 'anual'), 2380);
  assert.equal(planos.valorAssinatura('profissional', null), 119);
});

test('adicional não muda os recursos do plano', () => {
  assert.deepEqual(
    planos.recursosDe('profissional', ['fiscal']),
    [...planos.PLANOS.profissional.recursos, 'fiscal'],
  );
});
