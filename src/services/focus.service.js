'use strict';
const AppError = require('../utils/AppError');

/**
 * Cliente HTTP da Focus NFe (emissão de NFS-e/NF-e). Conta única do
 * Gestão Torque: cada oficina é uma "empresa" dentro dela.
 *
 * Config no .env:
 *   FOCUS_TOKEN_MASTER      token master da conta — cadastra/atualiza empresas
 *   FOCUS_URL_PRODUCAO      default https://api.focusnfe.com.br
 *   FOCUS_URL_HOMOLOGACAO   default https://homologacao.focusnfe.com.br
 *
 * Autenticação: HTTP Basic com o token como usuário e senha vazia. A API de
 * empresas sempre usa a URL de produção (com o token master); a emissão usa
 * a URL do ambiente da oficina com o token DA EMPRESA naquele ambiente.
 *
 * Tokens nunca vão pra log nem pra mensagem de erro.
 */

const URLS = {
  producao: process.env.FOCUS_URL_PRODUCAO || 'https://api.focusnfe.com.br',
  homologacao: process.env.FOCUS_URL_HOMOLOGACAO || 'https://homologacao.focusnfe.com.br',
};
const TOKEN_MASTER = process.env.FOCUS_TOKEN_MASTER || '';

function configurado() { return Boolean(TOKEN_MASTER); }

// Nomes de campo da Focus que a oficina não reconheceria na tela.
const CAMPO_AMIGAVEL = {
  arquivo_certificado_base64: 'certificado',
  senha_certificado: 'senha do certificado',
  nome: 'razão social',
};

/**
 * Converte a resposta de erro da Focus em AppError. 422 de validação vira
 * `details` no formato que o frontend já mostra ({ campo, erro }).
 */
function erroDaFocus(status, json) {
  const lista = Array.isArray(json?.erros) ? json.erros : [];
  if (status === 401) {
    return new AppError('Focus NFe recusou o token (verifique FOCUS_TOKEN_MASTER)', 502);
  }
  if (status === 429) {
    return new AppError('Focus NFe: muitas requisições, tente de novo em instantes', 503);
  }
  const msg = json?.mensagem || lista[0]?.mensagem || `HTTP ${status}`;
  const details = lista
    .filter((e) => e.mensagem)
    .map((e) => ({ campo: CAMPO_AMIGAVEL[e.campo] || e.campo || e.codigo || 'focus', erro: e.mensagem }));
  return new AppError(`Focus NFe: ${msg}`, status === 422 || status === 400 ? 422 : 502,
    details.length ? details : undefined);
}

/**
 * Chamada genérica. `token` default = master. `ambiente` escolhe a URL base
 * (empresas sempre em produção).
 */
async function req(path, { method = 'GET', body, query, token = TOKEN_MASTER, ambiente = 'producao' } = {}) {
  if (!token) throw new AppError('Focus NFe não configurada — defina FOCUS_TOKEN_MASTER no .env', 503);
  const url = new URL(`${URLS[ambiente]}${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new AppError(`Focus NFe indisponível: ${err.message}`, 502);
  }
  const texto = await res.text();
  let json = {};
  try { json = texto ? JSON.parse(texto) : {}; } catch { json = { mensagem: texto.slice(0, 200) }; }
  if (!res.ok) throw erroDaFocus(res.status, json);
  return json;
}

// ---------------------------------------------------------------- Empresas

/** POST /v2/empresas. `dryRun` valida sem gravar. */
function criarEmpresa(dados, { dryRun = false } = {}) {
  return req('/v2/empresas', { method: 'POST', body: dados, query: { dry_run: dryRun ? 1 : undefined } });
}

/** PUT /v2/empresas/:id — só os campos enviados mudam. */
function atualizarEmpresa(id, dados, { dryRun = false } = {}) {
  return req(`/v2/empresas/${encodeURIComponent(id)}`, {
    method: 'PUT', body: dados, query: { dry_run: dryRun ? 1 : undefined },
  });
}

function consultarEmpresa(id) {
  return req(`/v2/empresas/${encodeURIComponent(id)}`);
}

/** Empresa da conta com este CNPJ (GET /v2/empresas?cnpj=), ou null. */
async function buscarEmpresaPorCnpj(cnpj) {
  const lista = await req('/v2/empresas', { query: { cnpj } });
  return (Array.isArray(lista) ? lista : []).find((e) => String(e.cnpj) === String(cnpj)) || null;
}

// ---------------------------------------------------------------- Gatilhos

/** Gatilhos (webhooks) da empresa no ambiente. Usa o token DA EMPRESA. */
function listarGatilhos({ token, ambiente }) {
  return req('/v2/hooks', { token, ambiente });
}

function criarGatilho(dados, { token, ambiente }) {
  return req('/v2/hooks', { method: 'POST', body: dados, token, ambiente });
}

// ---------------------------------------------------------------- NFS-e Nacional

/**
 * POST /v2/nfsen?ref= — a Focus pré-valida na hora (400/422) e, se passar,
 * responde 202 com status processando_autorizacao. A autorização chega
 * depois, por webhook ou consulta.
 */
function emitirNfsen(ref, dados, { token, ambiente }) {
  return req('/v2/nfsen', { method: 'POST', body: dados, query: { ref }, token, ambiente });
}

function consultarNfsen(ref, { token, ambiente }) {
  return req(`/v2/nfsen/${encodeURIComponent(ref)}`, { token, ambiente });
}

/** DELETE /v2/nfsen/:ref — cancelamento síncrono, justificativa de 15 a 255 caracteres. */
function cancelarNfsen(ref, justificativa, { token, ambiente }) {
  return req(`/v2/nfsen/${encodeURIComponent(ref)}`, { method: 'DELETE', body: { justificativa }, token, ambiente });
}

// ---------------------------------------------------------------- NFS-e municipal

/**
 * NFS-e pelo sistema da prefeitura (padrão do município, ex.: Gravataí /
 * AtendeNet). POST /v2/nfse?ref=; a prefeitura autoriza depois.
 */
function emitirNfse(ref, dados, { token, ambiente }) {
  return req('/v2/nfse', { method: 'POST', body: dados, query: { ref }, token, ambiente });
}

function consultarNfse(ref, { token, ambiente }) {
  return req(`/v2/nfse/${encodeURIComponent(ref)}`, { token, ambiente });
}

function cancelarNfse(ref, justificativa, { token, ambiente }) {
  return req(`/v2/nfse/${encodeURIComponent(ref)}`, { method: 'DELETE', body: { justificativa }, token, ambiente });
}

// ---------------------------------------------------------------- NF-e

/** POST /v2/nfe?ref= — 202 processando (assíncrona) ou 201 já autorizada (síncrona). */
function emitirNfe(ref, dados, { token, ambiente }) {
  return req('/v2/nfe', { method: 'POST', body: dados, query: { ref }, token, ambiente });
}

function consultarNfe(ref, { token, ambiente }) {
  return req(`/v2/nfe/${encodeURIComponent(ref)}`, { token, ambiente });
}

/** DELETE /v2/nfe/:ref — síncrono; a SEFAZ aceita em até 24 h da emissão (varia por UF). */
function cancelarNfe(ref, justificativa, { token, ambiente }) {
  return req(`/v2/nfe/${encodeURIComponent(ref)}`, { method: 'DELETE', body: { justificativa }, token, ambiente });
}

/** A Focus devolve o XML como caminho relativo; vira URL completa do ambiente. */
function urlArquivo(caminho, ambiente) {
  if (!caminho) return null;
  return /^https?:\/\//.test(caminho) ? caminho : `${URLS[ambiente]}${caminho}`;
}

module.exports = {
  URLS, configurado, req, criarEmpresa, atualizarEmpresa, consultarEmpresa, buscarEmpresaPorCnpj,
  listarGatilhos, criarGatilho, emitirNfsen, consultarNfsen, cancelarNfsen,
  emitirNfse, consultarNfse, cancelarNfse,
  emitirNfe, consultarNfe, cancelarNfe, urlArquivo,
};
