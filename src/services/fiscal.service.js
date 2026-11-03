'use strict';
const db = require('../config/db');
const focus = require('./focus.service');
const { cifrar, decifrar } = require('../utils/cripto');
const AppError = require('../utils/AppError');

/**
 * Configuração fiscal da oficina (public.oficina_fiscal) e o cadastro dela
 * como "empresa" na Focus NFe.
 *
 * Fluxo:
 *  1. salvar(): a oficina preenche emitente, endereço e parâmetros. Se já
 *     está conectada na Focus, a mudança vai pra lá ANTES de gravar aqui
 *     (recusa da Focus = nada muda).
 *  2. conectar(): com tudo preenchido, envia o certificado A1 + senha e cria
 *     (ou atualiza) a empresa na Focus. Guarda id, tokens criptografados,
 *     validade do certificado e o código IBGE que a Focus resolve.
 *     O certificado e a senha não são guardados.
 */

// Campos que a oficina edita. ambiente fica à parte (exige conexão).
const CAMPOS = [
  'cnpj', 'razao_social', 'nome_fantasia', 'inscricao_municipal', 'inscricao_estadual',
  'regime_tributario', 'cnae', 'email',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf',
  'nfse_padrao', 'codigo_servico', 'codigo_tributacao_municipal', 'aliquota_iss', 'iss_retido',
  'serie_nfe', 'ncm_padrao', 'cfop_padrao',
];

// Sem estes não dá pra cadastrar na Focus nem emitir. Rótulos pra tela.
const OBRIGATORIOS = {
  cnpj: 'CNPJ',
  razao_social: 'Razão social',
  regime_tributario: 'Regime tributário',
  email: 'E-mail fiscal',
  inscricao_municipal: 'Inscrição municipal',
  inscricao_estadual: 'Inscrição estadual (ou ISENTO)',
  cep: 'CEP',
  logradouro: 'Logradouro',
  numero: 'Número',
  bairro: 'Bairro',
  municipio: 'Município',
  uf: 'UF',
  codigo_servico: 'Código de tributação do serviço',
  aliquota_iss: 'Alíquota de ISS',
};

const REGIME_FOCUS = {
  simples_nacional: 1,
  simples_excesso_sublimite: 2,
  regime_normal: 3,
  mei: 4,
};

const digitos = (v) => (v ? String(v).replace(/\D/g, '') : '');

async function linha(oficinaId) {
  const { rows } = await db.pool.query(
    `SELECT f.*, f.certificado_valido_ate::text AS certificado_valido_ate,
            o.telefone AS oficina_telefone, CURRENT_DATE::text AS hoje
       FROM oficinas o
       LEFT JOIN oficina_fiscal f ON f.oficina_id = o.id
      WHERE o.id = $1`, [oficinaId],
  );
  if (!rows[0]) throw AppError.notFound('Oficina não encontrada');
  return rows[0];
}

function pendencias(f) {
  return Object.entries(OBRIGATORIOS)
    .filter(([campo]) => f[campo] === null || f[campo] === undefined || f[campo] === '')
    .map(([campo, rotulo]) => ({ campo, rotulo }));
}

/** Visão pra tela: sem tokens, com a situação calculada. */
function visao(f) {
  const dados = Object.fromEntries(CAMPOS.map((c) => [c, f[c] ?? null]));
  const conectada = Boolean(f.focus_empresa_id);
  const certificadoVencido = Boolean(f.certificado_valido_ate && f.certificado_valido_ate < f.hoje);
  const pend = pendencias(f);
  const tokenDoAmbiente = (f.ambiente || 'homologacao') === 'producao'
    ? f.focus_token_producao_enc : f.focus_token_homologacao_enc;
  return {
    ...dados,
    aliquota_iss: f.aliquota_iss === null || f.aliquota_iss === undefined ? null : Number(f.aliquota_iss),
    nfse_padrao: f.nfse_padrao || 'nacional',
    iss_retido: f.iss_retido ?? false,
    serie_nfe: f.serie_nfe ?? 1,
    ambiente: f.ambiente || 'homologacao',
    codigo_municipio: f.codigo_municipio ?? null,
    certificado_valido_ate: f.certificado_valido_ate ?? null,
    focus_configurada: focus.configurado(),
    conectada,
    certificado_vencido: certificadoVencido,
    pendencias: pend,
    pronta: conectada && Boolean(tokenDoAmbiente) && !certificadoVencido && pend.length === 0,
  };
}

async function obter(oficinaId) {
  return visao(await linha(oficinaId));
}

/** Corpo de POST/PUT /v2/empresas a partir da config (sem certificado). */
function payloadEmpresa(f) {
  const ie = /^isento$/i.test(f.inscricao_estadual || '') ? undefined : digitos(f.inscricao_estadual) || undefined;
  const nacional = (f.nfse_padrao || 'nacional') === 'nacional';
  const producao = f.ambiente === 'producao';
  const serie = String(f.serie_nfe || 1);
  return {
    nome: f.razao_social,
    nome_fantasia: f.nome_fantasia || undefined,
    cnpj: f.cnpj,
    inscricao_estadual: ie,
    inscricao_municipal: digitos(f.inscricao_municipal) || undefined,
    regime_tributario: REGIME_FOCUS[f.regime_tributario],
    email: f.email,
    telefone: digitos(f.oficina_telefone).replace(/^55(?=\d{10,11}$)/, '') || undefined,
    logradouro: f.logradouro,
    numero: f.numero,
    complemento: f.complemento || undefined,
    bairro: f.bairro,
    cep: f.cep,
    municipio: f.municipio,
    uf: f.uf,
    habilita_nfe: true,
    serie_nfe_producao: serie,
    serie_nfe_homologacao: serie,
    // NFS-e Nacional e a municipal são excludentes na Focus.
    habilita_nfse: !nacional,
    habilita_nfsen_homologacao: nacional,
    habilita_nfsen_producao: nacional && producao,
  };
}

/** Grava o que a Focus devolveu sobre a empresa. Tokens vazios não apagam os atuais. */
async function gravarRespostaFocus(client, oficinaId, emp) {
  await client.query(
    `UPDATE oficina_fiscal SET
        focus_empresa_id            = COALESCE($2, focus_empresa_id),
        focus_token_producao_enc    = COALESCE($3, focus_token_producao_enc),
        focus_token_homologacao_enc = COALESCE($4, focus_token_homologacao_enc),
        certificado_valido_ate      = COALESCE($5::date, certificado_valido_ate),
        codigo_municipio            = COALESCE($6, codigo_municipio)
      WHERE oficina_id = $1`,
    [
      oficinaId,
      emp.id !== undefined && emp.id !== null ? String(emp.id) : null,
      cifrar(emp.token_producao),
      cifrar(emp.token_homologacao),
      emp.certificado_valido_ate ? String(emp.certificado_valido_ate).slice(0, 10) : null,
      /^\d{7}$/.test(String(emp.codigo_municipio || '')) ? String(emp.codigo_municipio) : null,
    ],
  );
}

async function upsert(client, oficinaId, campos) {
  const cols = Object.keys(campos);
  const vals = cols.map((c) => campos[c]);
  if (!cols.length) {
    await client.query(
      'INSERT INTO oficina_fiscal (oficina_id) VALUES ($1) ON CONFLICT (oficina_id) DO NOTHING', [oficinaId]);
    return;
  }
  await client.query(
    `INSERT INTO oficina_fiscal (oficina_id, ${cols.join(', ')})
          VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (oficina_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`,
    [oficinaId, ...vals],
  );
}

/**
 * Salva a config. Só os campos enviados mudam. Trocar pra produção exige
 * estar conectada e sem pendências.
 */
async function salvar(oficinaId, dados) {
  const atual = await linha(oficinaId);
  const campos = {};
  for (const c of [...CAMPOS, 'ambiente']) if (dados[c] !== undefined) campos[c] = dados[c];
  const nova = { ...atual, ...campos };

  if (nova.ambiente === 'producao' && atual.ambiente !== 'producao') {
    if (!atual.focus_empresa_id) {
      throw new AppError('Conecte a oficina na Focus (envie o certificado) antes de ir pra produção', 422);
    }
    if (pendencias(nova).length) throw new AppError('Preencha os dados obrigatórios antes de ir pra produção', 422);
  }

  let emp = null;
  if (atual.focus_empresa_id) {
    if (pendencias(nova).length) {
      throw new AppError('Oficina já conectada na Focus: os campos obrigatórios não podem ficar vazios', 422);
    }
    emp = await focus.atualizarEmpresa(atual.focus_empresa_id, payloadEmpresa(nova));
  }

  await db.withTransaction(async (client) => {
    await upsert(client, oficinaId, campos);
    if (emp) await gravarRespostaFocus(client, oficinaId, emp);
  });
  return obter(oficinaId);
}

/**
 * Envia o certificado A1 e cria/atualiza a empresa na Focus. `arquivo` é o
 * Buffer do .pfx/.p12; nem ele nem a senha são guardados.
 */
async function conectar(oficinaId, { arquivo, senha }) {
  if (!focus.configurado()) {
    throw new AppError('Emissão de nota ainda não liberada na plataforma (Focus NFe não configurada)', 503);
  }
  const atual = await linha(oficinaId);
  const pend = pendencias(atual);
  if (pend.length) {
    throw new AppError(
      `Preencha antes de enviar o certificado: ${pend.map((p) => p.rotulo).join(', ')}`, 422,
      pend.map((p) => ({ campo: p.campo, erro: 'obrigatório' })),
    );
  }

  const corpo = {
    ...payloadEmpresa(atual),
    arquivo_certificado_base64: arquivo.toString('base64'),
    senha_certificado: senha,
    certificado_especifico: true,
  };
  const emp = atual.focus_empresa_id
    ? await focus.atualizarEmpresa(atual.focus_empresa_id, corpo)
    : await focus.criarEmpresa(corpo);

  await db.withTransaction((client) => gravarRespostaFocus(client, oficinaId, emp));
  await garantirGatilhos(oficinaId).catch((err) => {
    // Sem gatilho a nota ainda atualiza pela reconsulta periódica; não
    // vale falhar a conexão por isso.
    console.error(`[fiscal] gatilhos da oficina ${oficinaId}: ${err.message}`);
  });
  return obter(oficinaId);
}

// Eventos que avisam mudança de status das notas que a oficina emite.
const EVENTOS_GATILHO = ['nfsen', 'nfse', 'nfe'];

/**
 * Cadastra na Focus (nos dois ambientes) os gatilhos que chamam nosso
 * webhook. Idempotente: pula o que já existe com a mesma URL e evento.
 * Config no .env: FOCUS_WEBHOOK_URL (URL pública de /api/webhooks/focus) e
 * FOCUS_WEBHOOK_TOKEN (enviado pela Focus no header X-Webhook-Token).
 * Sem FOCUS_WEBHOOK_URL (ambiente local), não faz nada.
 */
async function garantirGatilhos(oficinaId) {
  const url = process.env.FOCUS_WEBHOOK_URL;
  if (!url) return [];
  const f = await linha(oficinaId);
  const criados = [];
  for (const ambiente of ['homologacao', 'producao']) {
    const enc = ambiente === 'producao' ? f.focus_token_producao_enc : f.focus_token_homologacao_enc;
    if (!enc) continue;
    const token = decifrar(enc);
    const existentes = await focus.listarGatilhos({ token, ambiente });
    for (const event of EVENTOS_GATILHO) {
      const ja = (Array.isArray(existentes) ? existentes : [])
        .some((g) => g.url === url && g.event === event && (!g.cnpj || g.cnpj === f.cnpj));
      if (ja) continue;
      await focus.criarGatilho({
        cnpj: f.cnpj, event, url,
        authorization: process.env.FOCUS_WEBHOOK_TOKEN || null,
        authorization_header: process.env.FOCUS_WEBHOOK_TOKEN ? 'X-Webhook-Token' : null,
      }, { token, ambiente });
      criados.push(`${ambiente}:${event}`);
    }
  }
  return criados;
}

/**
 * Tudo que a emissão precisa da oficina: os dados fiscais e o token
 * (decifrado) do ambiente atual. Recusa com o motivo se não estiver pronta.
 */
async function credenciais(oficinaId) {
  const f = await linha(oficinaId);
  const v = visao(f);
  if (!v.pronta) {
    const motivo = v.pendencias.length
      ? `faltam dados fiscais (${v.pendencias.map((p) => p.rotulo).join(', ')})`
      : !v.conectada ? 'o certificado digital não foi enviado'
        : v.certificado_vencido ? 'o certificado digital venceu' : 'a conexão com o emissor está incompleta';
    throw new AppError(`Emissão indisponível: ${motivo}. Veja Configurações > Fiscal.`, 422);
  }
  const ambiente = v.ambiente;
  const token = decifrar(ambiente === 'producao' ? f.focus_token_producao_enc : f.focus_token_homologacao_enc);
  return { fiscal: { ...f, ...v }, ambiente, token };
}

/** Token de um ambiente específico (a nota é consultada no ambiente em que foi emitida). */
async function tokenDoAmbiente(oficinaId, ambiente) {
  const f = await linha(oficinaId);
  const enc = ambiente === 'producao' ? f.focus_token_producao_enc : f.focus_token_homologacao_enc;
  if (!enc) throw new AppError(`Oficina sem token da Focus em ${ambiente}`, 422);
  return decifrar(enc);
}

module.exports = {
  CAMPOS, OBRIGATORIOS, obter, salvar, conectar, payloadEmpresa, pendencias,
  garantirGatilhos, credenciais, tokenDoAmbiente,
};
