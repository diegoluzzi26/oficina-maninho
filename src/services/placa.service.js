'use strict';
const AppError = require('../utils/AppError');

/**
 * Consulta de veículo pela placa via API Placas (wdapi2.com.br), conta única
 * da plataforma. Sem PLACA_API_TOKEN no .env, a consulta fica desligada e o
 * formulário segue manual.
 *
 * O token vai no caminho da URL (é o formato do provedor), então a URL
 * nunca é logada nem devolvida em erro.
 *
 * Cada consulta é cobrada: o resultado fica num cache em memória por 24h
 * (dado do veículo não é por oficina) pra não pagar duas vezes a mesma placa.
 */

const BASE_URL = () => (process.env.PLACA_API_URL || 'https://wdapi2.com.br/consulta').replace(/\/+$/, '');
const TIMEOUT_MS = 10000;
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();

const ativo = () => !!process.env.PLACA_API_TOKEN;

const MARCAS = {
  VW: 'Volkswagen', VOLKSWAGEN: 'Volkswagen', VOLKSWAGEM: 'Volkswagen',
  GM: 'Chevrolet', CHEVROLET: 'Chevrolet', CHEV: 'Chevrolet',
  'M.BENZ': 'Mercedes-Benz', 'MERCEDES-BENZ': 'Mercedes-Benz', MERCEDES: 'Mercedes-Benz', MB: 'Mercedes-Benz',
  'LR': 'Land Rover', 'LAND ROVER': 'Land Rover', 'LANDROVER': 'Land Rover',
  BMW: 'BMW', BYD: 'BYD', GWM: 'GWM', JAC: 'JAC', RAM: 'RAM', MINI: 'MINI', CAOA: 'Caoa Chery',
  'CAOA CHERY': 'Caoa Chery', CHERY: 'Chery',
};

const titulo = (s) => String(s || '').trim().toLowerCase()
  .replace(/(^|[\s\-/])([a-zà-ú])/g, (_, a, b) => a + b.toUpperCase());

function normalizarMarca(bruta) {
  let m = String(bruta || '').trim().toUpperCase().replace(/^I\//, ''); // "I/" = importado
  if (!m) return '';
  if (MARCAS[m] !== undefined) return MARCAS[m];
  return titulo(m);
}

/** "VW/GOL 1.0 GIV" -> "Gol 1.0 Giv": tira o prefixo da marca. */
function normalizarModelo(bruto) {
  const m = String(bruto || '').trim();
  if (!m) return '';
  const semMarca = m.includes('/') ? m.slice(m.indexOf('/') + 1) : m;
  return titulo(semMarca)
    .replace(/\b(\d+(?:\.\d+)?)([a-z]{1,3})\b/gi, (_, n, l) => n + l.toUpperCase()) // 1.0mt, 16v
    .replace(/\b(Tsi|Tfsi|Flex|Gnv|Cvt|Ltz|Lt|Ls|Gl|Gli|Glx|Xei|Exl|Lx|Ex|Gt|Gti|Rs|Sw|4x4|4x2|Ad|Hb|Cd|Cs)\b/g,
      (x) => x.toUpperCase());
}

/** Resposta do provedor -> campos do formulário de carro. Tolerante a campos ausentes. */
function mapearResposta(json, placa) {
  const j = json || {};
  const ex = j.extra || {};
  const marca = normalizarMarca(j.MARCA || j.marca || ex.marca);
  const modelo = normalizarModelo(j.MODELO || j.modelo || ex.modelo);
  const anoBruto = j.anoModelo || j.ano_modelo || j.ano || ex.ano_modelo || ex.ano_fabricacao;
  const ano = Number.parseInt(String(anoBruto || '').slice(0, 4), 10);
  const chassiBruto = String(j.chassi || ex.chassi || '').trim().toUpperCase();
  return {
    placa,
    marca,
    modelo,
    ano: ano >= 1900 && ano <= 2100 ? ano : null,
    cor: j.cor ? titulo(j.cor) : null,
    // o provedor costuma mascarar parte do chassi; só aproveita se vier inteiro
    chassi: /^[A-HJ-NPR-Z0-9]{17}$/.test(chassiBruto) ? chassiBruto : null,
    combustivel: ex.combustivel ? titulo(ex.combustivel) : null,
    municipio: j.municipio ? titulo(j.municipio) : null,
    uf: j.uf ? String(j.uf).toUpperCase() : null,
  };
}

function mensagemErro(status, json) {
  const msg = (json && (json.mensagemRetorno || json.message || json.erro)) || '';
  if (status === 401 || status === 403) return 'Consulta de placa: token inválido. Avise o suporte.';
  if (status === 402) return 'Consulta de placa sem saldo no provedor. Avise o suporte.';
  if (status === 404 || status === 406) return 'Placa não encontrada na base. Preencha os dados à mão.';
  if (status === 429) return 'Muitas consultas seguidas. Tente de novo em alguns segundos.';
  return msg ? `Consulta de placa falhou: ${msg}` : 'Consulta de placa indisponível agora. Preencha à mão.';
}

async function consultar(placaEntrada) {
  if (!ativo()) throw new AppError('Consulta de placa não configurada', 503);
  const placa = String(placaEntrada || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) throw new AppError('Placa inválida (ex: ABC1D23)', 400);

  const hit = cache.get(placa);
  if (hit && Date.now() - hit.em < CACHE_MS) return hit.dados;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res; let json = null;
  try {
    res = await fetch(`${BASE_URL()}/${placa}/${encodeURIComponent(process.env.PLACA_API_TOKEN)}`,
      { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    json = await res.json().catch(() => null);
  } catch (e) {
    throw new AppError(e.name === 'AbortError'
      ? 'Consulta de placa demorou demais. Preencha à mão.'
      : 'Consulta de placa indisponível agora. Preencha à mão.', 502);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const st = [404, 406].includes(res.status) ? 404 : res.status === 429 ? 429 : 502;
    throw new AppError(mensagemErro(res.status, json), st);
  }
  const dados = mapearResposta(json, placa);
  if (!dados.marca && !dados.modelo) throw new AppError(mensagemErro(404, json), 404);

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(placa, { em: Date.now(), dados });
  return dados;
}

module.exports = { ativo, consultar, mapearResposta, normalizarMarca, normalizarModelo };
