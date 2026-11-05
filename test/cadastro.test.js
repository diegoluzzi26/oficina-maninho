'use strict';
/**
 * Cadastro self-service: geração do slug e limites anti-abuso. Puro, sem banco.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/services/cadastro.service');

const SLUG_RE = /^[a-z][a-z0-9_]{2,30}$/; // mesma regra do provisionamento

test('slug sai do nome da oficina, sem acento e válido pro schema', () => {
  assert.equal(c.slugBase('Auto Elétrica São João'), 'auto_eletrica_sao_joao');
  assert.equal(c.slugBase('  Mecânica   do Zé!! '), 'mecanica_do_ze');
  assert.equal(c.slugBase('4 Rodas Centro Automotivo'), 'oficina_4_rodas_centro_aut');
  assert.equal(c.slugBase('AB'), 'oficina');
  for (const n of ['A', '!!!', 'Oficina Mecânica Multimarcas Especializada em Câmbio', 'Zé', '123']) {
    assert.match(c.slugBase(n), SLUG_RE, n);
  }
});

test('limita cadastros por IP por hora', () => {
  c._zerarLimites();
  const t = Date.now();
  for (let i = 0; i < 3; i += 1) {
    c.checarLimites('1.1.1.1', t);
    c.contar('1.1.1.1', t);
  }
  assert.throws(() => c.checarLimites('1.1.1.1', t), { statusCode: 429 });
  // Outro IP segue livre, e o mesmo IP volta depois de uma hora.
  c.checarLimites('2.2.2.2', t);
  c.checarLimites('1.1.1.1', t + 61 * 60 * 1000);
  c._zerarLimites();
});
