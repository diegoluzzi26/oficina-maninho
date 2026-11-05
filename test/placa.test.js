'use strict';
/**
 * Consulta de placa (src/services/placa.service.js). Sem banco; o fetch é
 * substituído por um falso pra não gastar consulta paga.
 */
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../src/services/placa.service');

// Formato da API Placas v3 (/v3/basico/{placa}), conforme a documentação.
const respostaCrossfox = {
  basico: {
    error: false,
    message: '',
    dados: {
      marcamodelo: 'VW/CROSSFOX', mensagemRetorno: 'Sem erros.', final_chassi: '00000',
      modelo: 'CROSSFOX', marca: 'VW', cor: 'PRATA', ano: '2007', anoModelo: '2008',
      municipio: 'São Leopoldo', uf: 'RS', combustivel: 'Alcool / Gasolina',
    },
  },
  error: false,
  message: 'Consulta efetuada com sucesso',
};

let fetchOriginal; let chamadas;
beforeEach(() => {
  fetchOriginal = global.fetch; chamadas = [];
  process.env.PLACA_API_TOKEN = 'token-teste';
});
afterEach(() => { global.fetch = fetchOriginal; delete process.env.PLACA_API_TOKEN; });

const fetchFalso = (status, body) => async (url, opts = {}) => {
  chamadas.push({ url, headers: opts.headers || {} });
  return { ok: status < 400, status, json: async () => body };
};

test('mapeia a resposta v3 pros campos do formulário', () => {
  const d = svc.mapearResposta(respostaCrossfox, 'INT8C36');
  assert.equal(d.marca, 'Volkswagen');
  assert.equal(d.modelo, 'Crossfox');
  assert.equal(d.ano, 2008, 'usa o ano do modelo');
  assert.equal(d.cor, 'Prata');
  assert.equal(d.chassi, null, 'o básico só traz o final do chassi');
  assert.equal(d.combustivel, 'Alcool / Gasolina');
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

test('chama /v3/basico com o token no header Bearer, fora da URL', async () => {
  global.fetch = fetchFalso(200, respostaCrossfox);
  await svc.consultar('BAS1C00');
  const { url, headers } = chamadas[0];
  assert.equal(url, 'https://wdapi2.com.br/v3/basico/BAS1C00');
  assert.equal(headers.Authorization, 'Bearer token-teste');
  assert.ok(!url.includes('token-teste'));
});

test('consulta normaliza a placa e usa cache na segunda vez', async () => {
  global.fetch = fetchFalso(200, respostaCrossfox);
  const a = await svc.consultar('xyz-9a87');
  const b = await svc.consultar('XYZ9A87');
  assert.equal(a.placa, 'XYZ9A87');
  assert.deepEqual(a, b);
  assert.equal(chamadas.length, 1);
});

test('token com aspas e espaços copiados junto é limpo', async () => {
  process.env.PLACA_API_TOKEN = '  "token-teste"\n';
  global.fetch = fetchFalso(200, respostaCrossfox);
  await svc.consultar('LMP1A23');
  assert.equal(chamadas[0].headers.Authorization, 'Bearer token-teste');
});

test('placa não encontrada (HTTP 404) vira 404 com mensagem amigável', async () => {
  global.fetch = fetchFalso(404, { code: 'placa_nao_encontrada', message: 'Nenhum registro encontrado' });
  await assert.rejects(svc.consultar('NAO1A11'), (e) => e.statusCode === 404 && /não encontrada/.test(e.message));
});

test('bloco básico com erro em HTTP 200 também vira não encontrada', async () => {
  global.fetch = fetchFalso(200, { basico: { error: true, message: 'Sem dados', dados: {} } });
  await assert.rejects(svc.consultar('NAO1A12'), (e) => e.statusCode === 404);
});

test('token recusado (401) e sem saldo (402) não vazam o token', async () => {
  global.fetch = fetchFalso(401, { code: 'nao_autorizado', message: 'Token ausente ou inválido.' });
  await assert.rejects(svc.consultar('TOK1D00'), (e) => /token inválido/.test(e.message) && !e.message.includes('token-teste'));
  global.fetch = fetchFalso(402, { code: 'saldo_insuficiente' });
  await assert.rejects(svc.consultar('SAL1D00'), (e) => /saldo/.test(e.message));
});

test('sem token configurado fica desligado', async () => {
  delete process.env.PLACA_API_TOKEN;
  assert.equal(svc.ativo(), false);
  await assert.rejects(svc.consultar('ABC1D23'), (e) => e.statusCode === 503);
});

test('placa inválida é recusada antes de chamar o provedor', async () => {
  global.fetch = fetchFalso(200, respostaCrossfox);
  await assert.rejects(svc.consultar('12345'), (e) => e.statusCode === 400);
  assert.equal(chamadas.length, 0);
});
