'use strict';
/**
 * Regras de plano + adicionais (src/config/planos.js). Puro, sem banco.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const planos = require('../src/config/planos');

test('Completo já inclui nota fiscal, sem adicional', () => {
  assert.equal(planos.temRecurso('completo', 'fiscal', []), true);
  assert.equal(planos.temRecurso('completo', 'fiscal'), true);
});

test('no Profissional, nota fiscal depende do adicional', () => {
  assert.equal(planos.temRecurso('profissional', 'fiscal', ['fiscal']), true);
  assert.equal(planos.temRecurso('profissional', 'fiscal', []), false);
});

test('no Essencial o adicional fica inativo: não libera nem cobra', () => {
  assert.equal(planos.temRecurso('essencial', 'fiscal', ['fiscal']), false);
  assert.deepEqual(planos.adicionaisAtivos('essencial', ['fiscal']), []);
  assert.equal(planos.valorAssinatura('essencial', ['fiscal'], 'mensal'), 59);
});

test('oficina no Completo com adicional antigo não paga por ele', () => {
  assert.deepEqual(planos.adicionaisAtivos('completo', ['fiscal']), []);
  assert.equal(planos.valorAssinatura('completo', ['fiscal'], 'mensal'), 199);
  assert.equal(planos.valorAssinatura('completo', ['fiscal'], 'anual'), 1990);
  assert.equal(planos.temRecurso('completo', 'fiscal', ['fiscal']), true);
});

test('valor da assinatura soma plano + adicionais ativos', () => {
  assert.equal(planos.valorAssinatura('profissional', [], 'mensal'), 119);
  assert.equal(planos.valorAssinatura('profissional', ['fiscal'], 'mensal'), 158);
  assert.equal(planos.valorAssinatura('profissional', ['fiscal'], 'anual'), 1580);
  assert.equal(planos.valorAssinatura('profissional', null), 119);
});

test('adicional não muda os recursos do plano', () => {
  assert.deepEqual(
    planos.recursosDe('profissional', ['fiscal']),
    [...planos.PLANOS.profissional.recursos, 'fiscal'],
  );
});
