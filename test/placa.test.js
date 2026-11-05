'use strict';
/**
 * Consulta de placa (src/services/placa.service.js). Sem banco; o fetch é
 * substituído por um falso pra não gastar consulta paga.
 */
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../src/services/placa.service');

const respostaGol = {
  MARCA: 'VW', MODELO: 'VW/GOL 1.0 GIV', ano: '2015', anoModelo: '2016',
  cor: 'BRANCA', chassi: '*****12345', municipio: 'PORTO ALEGRE', uf: 'rs',
  extra: { combustivel: 'ALCOOL / GASOLINA' },
};

let fetchOriginal; let chamadas;
beforeEach(() => {
  fetchOriginal = global.fetch; chamadas = [];
  process.env.PLACA_API_TOKEN = 'token-teste';
});
afterEach(() => { global.fetch = fetchOriginal; delete process.env.PLACA_API_TOKEN; });

const fetchFalso = (status, body) => async (url) => {
  chamadas.push(url);
  return { ok: status < 400, status, json: async () => body };
};

test('mapeia a resposta do provedor pros campos do formulário', () => {
  const d = svc.mapearResposta(respostaGol, 'ABC1D23');
  assert.equal(d.marca, 'Volkswagen');
  assert.equal(d.modelo, 'Gol 1.0 Giv');
  assert.equal(d.ano, 2016);
  assert.equal(d.cor, 'Branca');
  assert.equal(d.chassi, null, 'chassi mascarado não é aproveitado');
  assert.equal(d.uf, 'RS');
});

test('normaliza marcas abreviadas e importadas', () => {
  assert.equal(svc.normalizarMarca('GM'), 'Chevrolet');
  assert.equal(svc.normalizarMarca('I/M.BENZ'), 'Mercedes-Benz');
  assert.equal(svc.normalizarMarca('TOYOTA'), 'Toyota');
});

test('modelo: siglas e motorização em maiúsculas', () => {
  assert.equal(svc.normalizarModelo('GM/ONIX 1.0MT LT'), 'Onix 1.0MT LT');
  assert.equal(svc.normalizarModelo('FIAT/PALIO FIRE 16V'), 'Palio Fire 16V');
});

test('aproveita chassi completo', () => {
  const d = svc.mapearResposta({ ...respostaGol, chassi: '9bwaa05u0ep123456' }, 'ABC1D23');
  assert.equal(d.chassi, '9BWAA05U0EP123456');
});

test('consulta normaliza a placa e usa cache na segunda vez', async () => {
  global.fetch = fetchFalso(200, respostaGol);
  const a = await svc.consultar('xyz-9a87');
  const b = await svc.consultar('XYZ9A87');
  assert.equal(a.placa, 'XYZ9A87');
  assert.deepEqual(a, b);
  assert.equal(chamadas.length, 1);
  assert.match(chamadas[0], /\/XYZ9A87\/token-teste$/);
});

test('token com aspas e espaços copiados junto é limpo', async () => {
  process.env.PLACA_API_TOKEN = '  "token-teste"\n';
  global.fetch = fetchFalso(200, respostaGol);
  await svc.consultar('LMP1A23');
  assert.match(chamadas[0], /\/LMP1A23\/token-teste$/);
});

test('placa não encontrada vira 404 com mensagem amigável', async () => {
  global.fetch = fetchFalso(406, { mensagemRetorno: 'Placa não encontrada' });
  await assert.rejects(svc.consultar('NAO1A11'), (e) => e.statusCode === 404 && /não encontrada/.test(e.message));
});

test('sem saldo e token inválido não vazam o token', async () => {
  global.fetch = fetchFalso(402, {});
  await assert.rejects(svc.consultar('SAL1D00'), (e) => /saldo/.test(e.message) && !e.message.includes('token-teste'));
});

test('sem token configurado fica desligado', async () => {
  delete process.env.PLACA_API_TOKEN;
  assert.equal(svc.ativo(), false);
  await assert.rejects(svc.consultar('ABC1D23'), (e) => e.statusCode === 503);
});

test('placa inválida é recusada antes de chamar o provedor', async () => {
  global.fetch = fetchFalso(200, respostaGol);
  await assert.rejects(svc.consultar('12345'), (e) => e.statusCode === 400);
  assert.equal(chamadas.length, 0);
});
