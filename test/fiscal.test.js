'use strict';
/**
 * Partes puras da nota fiscal: CNPJ, criptografia dos tokens e o corpo
 * enviado à Focus. Sem banco nem rede.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.FISCAL_ENC_KEY = 'a'.repeat(64);
const cnpj = require('../src/utils/cnpj');
const { cifrar, decifrar } = require('../src/utils/cripto');
const fiscal = require('../src/services/fiscal.service');

test('CNPJ numérico: aceita válido com ou sem máscara, recusa DV errado', () => {
  assert.equal(cnpj.valido('02.130.104/0001-46'), true);
  assert.equal(cnpj.valido('02130104000146'), true);
  assert.equal(cnpj.valido('02130104000147'), false);
  assert.equal(cnpj.valido('11111111111111'), false);
  assert.equal(cnpj.valido('123'), false);
});

test('CNPJ alfanumérico (exemplo da Receita) é aceito', () => {
  assert.equal(cnpj.valido('12.ABC.345/01DE-35'), true);
  assert.equal(cnpj.valido('12ABC34501DE36'), false);
  assert.equal(cnpj.limpar('12.abc.345/01de-35'), '12ABC34501DE35');
});

test('token cifrado volta igual e não aparece em claro', () => {
  const c = cifrar('token-secreto-123');
  assert.match(c, /^v1:/);
  assert.equal(c.includes('token-secreto-123'), false);
  assert.equal(decifrar(c), 'token-secreto-123');
  assert.notEqual(cifrar('x'), cifrar('x')); // IV aleatório
  assert.equal(cifrar(''), null);
});

test('token adulterado não decifra', () => {
  const partes = cifrar('abc').split(':');
  partes[3] = Buffer.from('xyz').toString('base64');
  assert.throws(() => decifrar(partes.join(':')));
});

const base = {
  cnpj: '02130104000146', razao_social: 'Oficina Teste Ltda', nome_fantasia: null,
  inscricao_municipal: '12.345', inscricao_estadual: '0123456789', regime_tributario: 'simples_nacional',
  email: 'fiscal@exemplo.com', oficina_telefone: '+5551999998888',
  cep: '94000000', logradouro: 'RS-020', numero: '1055', complemento: null, bairro: 'Centro',
  municipio: 'Gravataí', uf: 'RS', codigo_servico: '14.01', aliquota_iss: '3.00',
  nfse_padrao: 'nacional', serie_nfe: 1, ambiente: 'homologacao',
};

test('corpo da empresa na Focus: regime, IE com zero à esquerda, NFS-e nacional em homologação', () => {
  const p = fiscal.payloadEmpresa(base);
  assert.equal(p.nome, 'Oficina Teste Ltda');
  assert.equal(p.regime_tributario, 1);
  assert.equal(p.inscricao_estadual, '0123456789');
  assert.equal(p.inscricao_municipal, '12345');
  assert.equal(p.telefone, '51999998888');
  assert.equal(p.habilita_nfe, true);
  assert.equal(p.habilita_nfse, false);
  assert.equal(p.habilita_nfsen_homologacao, true);
  assert.equal(p.habilita_nfsen_producao, false);
  assert.equal(p.nome_fantasia, undefined);
});

test('produção liga a NFS-e nacional de produção; municipal desliga a nacional', () => {
  assert.equal(fiscal.payloadEmpresa({ ...base, ambiente: 'producao' }).habilita_nfsen_producao, true);
  const m = fiscal.payloadEmpresa({ ...base, nfse_padrao: 'municipal', ambiente: 'producao' });
  assert.equal(m.habilita_nfse, true);
  assert.equal(m.habilita_nfsen_producao, false);
  assert.equal(m.habilita_nfsen_homologacao, false);
});

test('IE ISENTO não é enviada', () => {
  assert.equal(fiscal.payloadEmpresa({ ...base, inscricao_estadual: 'ISENTO' }).inscricao_estadual, undefined);
});

test('pendências listam o que falta', () => {
  assert.deepEqual(fiscal.pendencias(base), []);
  const p = fiscal.pendencias({ ...base, cnpj: null, aliquota_iss: null });
  assert.deepEqual(p.map((x) => x.campo), ['cnpj', 'aliquota_iss']);
});
