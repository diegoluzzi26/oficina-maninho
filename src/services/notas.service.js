'use strict';
const db = require('../config/db');
const focus = require('./focus.service');
const fiscal = require('./fiscal.service');
const cnpj = require('../utils/cnpj');
const AppError = require('../utils/AppError');

/**
 * Notas fiscais emitidas a partir da OS (tabela notas_fiscais, no schema da
 * oficina). Nesta etapa: NFS-e Nacional da mão de obra.
 *
 * Fluxo:
 *  1. emitir(): valida a OS, grava a nota como 'processando' (o índice
 *     único barra duas notas vivas da mesma OS/tipo) e manda pra Focus.
 *     Recusa na pré-validação da Focus marca 'erro' na hora, com o motivo.
 *  2. A Focus autoriza depois. O webhook (/api/webhooks/focus) e a
 *     reconsulta periódica chamam atualizar(), que SEMPRE consulta a Focus
 *     (o corpo do webhook não é confiável) e aplica o status.
 *
 * ref enviada à Focus = "gt" + id da nota sem traços; public.notas_fiscais_ref
 * liga a ref à oficina pro webhook achar o schema certo.
 */

const STATUS_OS_EMITIVEL = ['finalizada', 'paga'];

const COLUNAS_NOTA = `id, os_id, tipo, ambiente, ref, status, valor, numero, serie, chave,
  codigo_verificacao, url_pdf, url_xml, mensagem_erro, emitida_por,
  criado_em, atualizado_em, autorizada_em, cancelada_em`;

const refDaNota = (id) => `gt${id.replace(/-/g, '')}`;
const digitos = (v) => (v ? String(v).replace(/\D/g, '') : '');
const dinheiro = (v) => Math.round(Number(v || 0) * 100) / 100;

// Horário de Brasília (sem horário de verão desde 2019): -03:00 fixo.
function isoBrasilia(d = new Date()) {
  return `${new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19)}-03:00`;
}

// Situação no Simples Nacional, como a NFS-e Nacional pede.
const OPCAO_SIMPLES = {
  simples_nacional: 3, simples_excesso_sublimite: 3, mei: 2, regime_normal: 1,
};
// Como o ISS é apurado: 1 = tudo pelo SN; 2 = ISS fora do SN (excesso de sublimite).
const APURACAO_SIMPLES = { simples_nacional: 1, simples_excesso_sublimite: 2 };

/** Tomador a partir do cadastro do cliente. Sem CPF/CNPJ válido, sai sem documento. */
function tomador(cliente) {
  const doc = cnpj.limpar(cliente.cpf_cnpj);
  const t = {};
  if (/^\d{11}$/.test(doc)) t.cpf_tomador = doc;
  else if (cnpj.valido(doc)) t.cnpj_tomador = doc;
  t.razao_social_tomador = String(cliente.nome || '').slice(0, 150);
  if (cliente.email) t.email_tomador = String(cliente.email).slice(0, 80);
  const tel = digitos(cliente.telefone).replace(/^55(?=\d{10,11}$)/, '');
  if (tel.length >= 6) t.telefone_tomador = tel;
  // Endereço só vai completo (a NFS-e exige o código IBGE junto).
  if (cliente.cep && cliente.codigo_municipio && cliente.logradouro) {
    Object.assign(t, {
      cep_tomador: cliente.cep,
      codigo_municipio_tomador: cliente.codigo_municipio,
      logradouro_tomador: cliente.logradouro,
      numero_tomador: cliente.numero || 'SN',
      complemento_tomador: cliente.complemento || undefined,
      bairro_tomador: cliente.bairro || undefined,
    });
  }
  return t;
}

/** "Serviços da OS nº 12 — Fiat Uno ABC1D23: Troca de óleo; Alinhamento (2x)". */
function descricao(os) {
  const veiculo = [os.marca, os.modelo, os.placa].filter(Boolean).join(' ');
  const itens = os.servicos
    .map((s) => (s.quantidade > 1 ? `${s.nome_servico} (${s.quantidade}x)` : s.nome_servico))
    .join('; ');
  return `Serviços da OS nº ${os.numero_os}${veiculo ? ` — ${veiculo}` : ''}: ${itens}`.slice(0, 1000);
}

/**
 * Valor e desconto da mão de obra. O desconto da OS vale pra OS inteira;
 * aqui entra só a parte proporcional aos serviços.
 */
function valoresServico(os) {
  const servicos = dinheiro(os.servicos.reduce((t, s) => t + Number(s.valor_total), 0));
  const pecas = dinheiro(os.pecas.reduce((t, p) => t + Number(p.valor_total), 0));
  const base = servicos + pecas;
  const desconto = base > 0 ? Math.min(servicos, dinheiro(Number(os.desconto || 0) * (servicos / base))) : 0;
  return { servicos, desconto };
}

/** Corpo do POST /v2/nfsen. Puro: recebe OS (com itens), cliente e config fiscal. */
function montarNfse(os, cliente, f, agora = new Date()) {
  const { servicos, desconto } = valoresServico(os);
  return {
    data_emissao: isoBrasilia(agora),
    data_competencia: isoBrasilia(os.fechada_em ? new Date(os.fechada_em) : agora).slice(0, 10),
    codigo_municipio_emissora: f.codigo_municipio,
    cnpj_prestador: f.cnpj,
    inscricao_municipal_prestador: digitos(f.inscricao_municipal) || undefined,
    codigo_opcao_simples_nacional: OPCAO_SIMPLES[f.regime_tributario],
    regime_tributario_simples_nacional: APURACAO_SIMPLES[f.regime_tributario],
    regime_especial_tributacao: 0,
    ...tomador(cliente),
    codigo_municipio_prestacao: f.codigo_municipio,
    codigo_tributacao_nacional_iss: f.codigo_servico,
    codigo_tributacao_municipal_iss: f.codigo_tributacao_municipal || undefined,
    descricao_servico: descricao(os),
    valor_servico: servicos,
    desconto_incondicionado: desconto > 0 ? desconto : undefined,
    tributacao_iss: 1,
    tipo_retencao_iss: f.iss_retido ? 2 : 1,
    percentual_aliquota_relativa_municipio: f.aliquota_iss === null ? undefined : Number(f.aliquota_iss),
  };
}

/** Texto do erro da Focus (pré-validação ou rejeição), com a correção sugerida. */
function textoErro(err) {
  if (err instanceof AppError) {
    const det = Array.isArray(err.details) ? err.details.map((d) => d.erro).join('; ') : '';
    return [err.message.replace(/^Focus NFe: /, ''), det].filter(Boolean).join(': ').slice(0, 1000);
  }
  return String(err?.message || err).slice(0, 1000);
}

function textoErrosFocus(erros) {
  return (Array.isArray(erros) ? erros : [])
    .map((e) => [e.mensagem, e.correcao && `Correção: ${e.correcao}`].filter(Boolean).join(' '))
    .join(' | ').slice(0, 1000) || 'Nota rejeitada pelo emissor';
}

function visao(n) {
  return n && { ...n, valor: Number(n.valor) };
}

async function buscar(id) {
  const { rows } = await db.query(`SELECT ${COLUNAS_NOTA} FROM notas_fiscais WHERE id = $1`, [id]);
  if (!rows[0]) throw AppError.notFound('Nota fiscal não encontrada');
  return visao(rows[0]);
}

async function listarDaOS(osId) {
  const { rows } = await db.query(
    `SELECT ${COLUNAS_NOTA} FROM notas_fiscais WHERE os_id = $1 ORDER BY criado_em DESC`, [osId]);
  return rows.map(visao);
}

async function carregarOS(osId) {
  const os = require('./os.service');
  const o = await os.buscarPorId(osId);
  const { rows: [cliente] } = await db.query('SELECT * FROM clientes WHERE id = $1', [o.cliente_id]);
  return { os: o, cliente };
}

/**
 * Emite a nota de um tipo pra OS. `oficinaId` e `userId` vêm do JWT.
 * Devolve a nota (status 'processando' ou 'erro' com o motivo).
 */
async function emitir(osId, tipo, { oficinaId, userId }) {
  if (tipo !== 'nfse') throw new AppError('Tipo de nota ainda não disponível', 422);

  const { fiscal: f, ambiente, token } = await fiscal.credenciais(oficinaId);
  const { os, cliente } = await carregarOS(osId);

  if (!STATUS_OS_EMITIVEL.includes(os.status)) {
    throw new AppError('Finalize a OS antes de emitir a nota fiscal', 422);
  }
  if (!os.servicos.length) throw new AppError('A OS não tem serviços (mão de obra) para a NFS-e', 422);
  const corpo = montarNfse(os, cliente, f);
  if (!(corpo.valor_servico > 0)) throw new AppError('O valor dos serviços da OS está zerado', 422);
  if (corpo.desconto_incondicionado >= corpo.valor_servico) {
    throw new AppError('O desconto cobre todo o valor dos serviços; não há NFS-e a emitir', 422);
  }

  let nota;
  try {
    nota = await db.withTransaction(async (client) => {
      const { rows: [n] } = await client.query(
        `INSERT INTO notas_fiscais (os_id, tipo, ambiente, ref, valor, payload_enviado, emitida_por)
         VALUES ($1, 'nfse', $2, 'tmp-' || gen_random_uuid(), $3, $4, $5)
         RETURNING id`,
        [osId, ambiente, dinheiro(corpo.valor_servico - (corpo.desconto_incondicionado || 0)), corpo, userId],
      );
      const ref = refDaNota(n.id);
      await client.query('UPDATE notas_fiscais SET ref = $2 WHERE id = $1', [n.id, ref]);
      await client.query('INSERT INTO public.notas_fiscais_ref (ref, oficina_id) VALUES ($1, $2)', [ref, oficinaId]);
      return { id: n.id, ref };
    });
  } catch (err) {
    if (err.code === '23505') {
      throw AppError.conflict('Esta OS já tem uma NFS-e em processamento ou autorizada');
    }
    throw err;
  }

  try {
    const r = await focus.emitirNfsen(nota.ref, corpo, { token, ambiente });
    await aplicarResposta(nota.id, r, ambiente);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 422) {
      // Pré-validação recusou: a nota não existe na Focus. Libera reemitir.
      await db.query(
        `UPDATE notas_fiscais SET status = 'erro', mensagem_erro = $2, resposta = $3 WHERE id = $1`,
        [nota.id, textoErro(err), { erro: textoErro(err) }],
      );
    } else {
      // Sem resposta clara (rede, 5xx): pode ter chegado. A reconsulta decide.
      await db.query(
        'UPDATE notas_fiscais SET mensagem_erro = $2 WHERE id = $1',
        [nota.id, `Sem confirmação do emissor ainda (${textoErro(err)}). O sistema vai consultar de novo.`],
      );
    }
  }
  return buscar(nota.id);
}

/** Aplica o retorno da Focus (emissão ou consulta) na nota. */
async function aplicarResposta(notaId, r, ambiente) {
  const st = r?.status;
  if (st === 'autorizado') {
    const chave = r.chave_nfse || (String(r.url || '').match(/[?&]chave=([^&]+)/) || [])[1] || null;
    await db.query(
      `UPDATE notas_fiscais SET status = 'autorizada', numero = $2, serie = $3, chave = $4,
              codigo_verificacao = $5, url_pdf = $6, url_xml = $7, mensagem_erro = NULL,
              resposta = $8, autorizada_em = COALESCE(autorizada_em, now())
        WHERE id = $1`,
      [notaId, r.numero ?? null, r.serie_rps ?? null, chave, r.codigo_verificacao ?? null,
        r.url_danfse || r.url || null, focus.urlArquivo(r.caminho_xml_nota_fiscal, ambiente), r],
    );
  } else if (st === 'erro_autorizacao' || st === 'negado') {
    await db.query(
      `UPDATE notas_fiscais SET status = 'erro', mensagem_erro = $2, resposta = $3 WHERE id = $1`,
      [notaId, textoErrosFocus(r.erros), r],
    );
  } else if (st === 'cancelado') {
    await db.query(
      `UPDATE notas_fiscais SET status = 'cancelada', resposta = $2,
              cancelada_em = COALESCE(cancelada_em, now()) WHERE id = $1`,
      [notaId, r],
    );
  } else {
    // processando_autorizacao (ou status novo): só guarda o retorno.
    await db.query('UPDATE notas_fiscais SET resposta = $2 WHERE id = $1', [notaId, r ?? {}]);
  }
}

/**
 * Consulta a Focus e atualiza a nota. Roda no contexto da oficina (request,
 * webhook ou agendador). `oficinaId` vem de quem chama, nunca do payload.
 */
async function atualizar(notaId, oficinaId) {
  const nota = await buscar(notaId);
  if (nota.status !== 'processando') return nota;
  const token = await fiscal.tokenDoAmbiente(oficinaId, nota.ambiente);
  const consulta = nota.tipo === 'nfse' ? focus.consultarNfsen : null;
  if (!consulta) return nota;
  try {
    await aplicarResposta(nota.id, await consulta(nota.ref, { token, ambiente: nota.ambiente }), nota.ambiente);
  } catch (err) {
    // 404 só depois de um tempo: a emissão nunca chegou na Focus.
    const antiga = Date.now() - new Date(nota.criado_em).getTime() > 10 * 60 * 1000;
    if (err instanceof AppError && /HTTP 404|não encontrad/i.test(err.message) && antiga) {
      await db.query(
        `UPDATE notas_fiscais SET status = 'erro', mensagem_erro = $2 WHERE id = $1`,
        [nota.id, 'A nota não chegou ao emissor. Emita de novo.'],
      );
    } else {
      throw err;
    }
  }
  return buscar(nota.id);
}

/** Webhook: resolve a nota pela ref (dentro do schema da oficina) e reconsulta. */
async function atualizarPorRef(ref, oficinaId) {
  const { rows } = await db.query('SELECT id FROM notas_fiscais WHERE ref = $1', [ref]);
  if (!rows[0]) return null;
  return atualizar(rows[0].id, oficinaId);
}

/** Reconsulta as notas presas em 'processando' da oficina atual. */
async function reconsultarPendentes(oficinaId, { limite = 20 } = {}) {
  const { rows } = await db.query(
    `SELECT id FROM notas_fiscais
      WHERE status = 'processando' AND criado_em < now() - interval '1 minute'
      ORDER BY criado_em LIMIT $1`, [limite],
  );
  let atualizadas = 0;
  for (const { id } of rows) {
    try { await atualizar(id, oficinaId); atualizadas += 1; } catch (err) {
      console.error(`[notas] reconsulta ${id}: ${err.message}`);
    }
  }
  return { pendentes: rows.length, atualizadas };
}

module.exports = {
  emitir, atualizar, atualizarPorRef, reconsultarPendentes, buscar, listarDaOS,
  montarNfse, valoresServico, aplicarResposta, refDaNota,
};
