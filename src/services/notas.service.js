'use strict';
const db = require('../config/db');
const focus = require('./focus.service');
const fiscal = require('./fiscal.service');
const cnpj = require('../utils/cnpj');
const AppError = require('../utils/AppError');

/**
 * Notas fiscais emitidas a partir da OS (tabela notas_fiscais, no schema da
 * oficina): NFS-e Nacional da mão de obra e NF-e das peças.
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

/**
 * Tomador a partir do cadastro do cliente. Sem CPF/CNPJ válido o tomador
 * não vai: a NFS-e Nacional não aceita tomador só com nome (o schema exige
 * CPF/CNPJ/NIF antes de xNome), então a nota sai sem tomador identificado.
 */
function tomador(cliente) {
  const doc = cnpj.limpar(cliente.cpf_cnpj);
  const t = {};
  if (/^\d{11}$/.test(doc)) t.cpf_tomador = doc;
  else if (cnpj.valido(doc)) t.cnpj_tomador = doc;
  else return t;
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
    // Sem IM: o emissor nacional identifica pelo CNPJ e recusa a IM quando o
    // município não tem dados complementares no CNC NFS-e (caso de Gravataí,
    // primeira emissão real em 2026-11-05).
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
    // Grupo de tributos aproximados (totTrib) é obrigatório; 0 = não informar
    // valores estimados (Decreto 8.264/2014).
    indicador_total_tributacao: 0,
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

/**
 * Lista paginada da aba Notas Fiscais (contrato padrão: pagina/por_pagina,
 * ordem estável criado_em DESC, id DESC). Filtros: tipo, status, período
 * (data de emissão), busca por cliente, nº da nota ou nº da OS.
 * `total_valor` soma só as autorizadas do filtro inteiro.
 */
async function listar(f = {}) {
  const where = []; const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (f.tipo) add('n.tipo = ?', f.tipo);
  if (f.status) add('n.status = ?', f.status);
  if (f.de) add('n.criado_em >= ?::date', f.de);
  if (f.ate) add("n.criado_em < (?::date + interval '1 day')", f.ate);
  if (f.busca) {
    const b = f.busca.trim();
    params.push(`%${b}%`);
    const i = params.length;
    where.push(`(c.nome ILIKE $${i} OR n.numero = $${i + 1} OR o.numero_os::text = $${i + 1})`);
    params.push(b.replace(/^#/, ''));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `FROM notas_fiscais n
    JOIN ordens_servico o ON o.id = n.os_id
    JOIN clientes c ON c.id = o.cliente_id ${clause}`;

  const pagina = f.pagina || 1;
  const porPagina = f.por_pagina || 20;
  const { rows: [agg] } = await db.query(
    `SELECT count(*)::int AS total,
            COALESCE(sum(n.valor) FILTER (WHERE n.status = 'autorizada'), 0)::numeric AS total_valor
       ${base}`, params);
  params.push(porPagina, (pagina - 1) * porPagina);
  const { rows } = await db.query(
    `SELECT ${COLUNAS_NOTA.split(',').map((c) => `n.${c.trim()}`).join(', ')},
            o.numero_os, c.nome AS cliente_nome
       ${base}
      ORDER BY n.criado_em DESC, n.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return {
    dados: rows.map(visao),
    paginacao: {
      pagina, por_pagina: porPagina, total: agg.total,
      paginas: Math.ceil(agg.total / porPagina),
      total_valor: Number(agg.total_valor),
    },
  };
}

// ---------------------------------------------------------------- NFS-e municipal

/**
 * NFS-e pelo sistema próprio da prefeitura (ex.: Gravataí / AtendeNet), no
 * formato da Focus (/v2/nfse). Puro. Diferente da Nacional: o tomador com
 * CPF/CNPJ e endereço completo (com código IBGE) é obrigatório, e a
 * inscrição municipal do prestador vai junto. Junta tudo que falta num 422.
 */
function montarNfseMunicipal(os, cliente, f, agora = new Date()) {
  const problemas = [];
  const doc = cnpj.limpar(cliente.cpf_cnpj);
  const tom = {};
  if (/^\d{11}$/.test(doc)) tom.cpf = doc;
  else if (cnpj.valido(doc)) tom.cnpj = doc;
  else problemas.push({ campo: 'Cliente', erro: 'sem CPF/CNPJ válido no cadastro' });

  const falta = [['cep', 'CEP'], ['logradouro', 'logradouro'], ['numero', 'número'], ['bairro', 'bairro'],
    ['uf', 'UF'], ['codigo_municipio', 'código IBGE (preencha pelo CEP)']]
    .filter(([c]) => !cliente[c]).map(([, r]) => r);
  if (falta.length) problemas.push({ campo: 'Endereço do cliente', erro: `falta ${falta.join(', ')}` });
  if (!digitos(f.inscricao_municipal)) {
    problemas.push({ campo: 'Aba Fiscal', erro: 'falta a inscrição municipal da oficina' });
  }
  if (problemas.length) throw new AppError('Não dá para emitir a NFS-e', 422, problemas);

  const { servicos, desconto } = valoresServico(os);
  const tel = digitos(cliente.telefone).replace(/^55(?=\d{10,11}$)/, '');
  const simples = ['simples_nacional', 'simples_excesso_sublimite', 'mei'].includes(f.regime_tributario);
  return {
    data_emissao: isoBrasilia(agora),
    natureza_operacao: '1', // tributação no município
    optante_simples_nacional: simples,
    // 5 = MEI; 6 = ME/EPP do Simples Nacional.
    regime_especial_tributacao: f.regime_tributario === 'mei' ? '5' : simples ? '6' : undefined,
    prestador: {
      cnpj: f.cnpj,
      inscricao_municipal: digitos(f.inscricao_municipal),
      codigo_municipio: f.codigo_municipio,
    },
    tomador: {
      ...tom,
      razao_social: String(cliente.nome || '').slice(0, 115),
      email: cliente.email ? String(cliente.email).slice(0, 80) : undefined,
      telefone: tel.length >= 10 && tel.length <= 11 ? tel : undefined,
      endereco: {
        logradouro: String(cliente.logradouro).slice(0, 125),
        numero: String(cliente.numero).slice(0, 10),
        complemento: cliente.complemento ? String(cliente.complemento).slice(0, 60) : undefined,
        bairro: String(cliente.bairro).slice(0, 60),
        codigo_municipio: cliente.codigo_municipio,
        uf: cliente.uf,
        cep: cliente.cep,
      },
    },
    servico: {
      valor_servicos: servicos,
      desconto_incondicionado: desconto > 0 ? desconto : undefined,
      iss_retido: Boolean(f.iss_retido),
      item_lista_servico: f.codigo_servico, // Gravataí: 6 dígitos (140101)
      discriminacao: descricao(os),
      codigo_municipio: f.codigo_municipio,
      aliquota: f.aliquota_iss === null || f.aliquota_iss === undefined ? undefined : Number(f.aliquota_iss),
    },
  };
}

// ---------------------------------------------------------------- NF-e (peças)

// Forma de pagamento da OS -> código tPag da NF-e.
const FORMA_NFE = {
  dinheiro: '01', cheque: '02', cartao_credito: '03', cartao_debito: '04',
  boleto: '15', pix: '17', transferencia: '18', outro: '99',
};

/** Reparte `total` proporcional a `pesos`, em centavos; o resto vai no último. */
function repartir(total, pesos) {
  const soma = pesos.reduce((t, p) => t + p, 0);
  if (!soma || !total) return pesos.map(() => 0);
  const partes = pesos.map((p) => dinheiro((total * p) / soma));
  partes[partes.length - 1] = dinheiro(total - partes.slice(0, -1).reduce((t, p) => t + p, 0));
  return partes;
}

/** Desconto da OS na parte das peças (mesma proporção usada na NFS-e). */
function descontoPecas(os) {
  const { servicos, desconto } = valoresServico(os);
  const pecas = dinheiro(os.pecas.reduce((t, p) => t + Number(p.valor_total), 0));
  return { pecas, desconto: dinheiro(Math.min(pecas, Number(os.desconto || 0) - desconto)), servicos };
}

/**
 * Corpo do POST /v2/nfe. Puro. `catalogo` = Map(peca_id -> { ncm, cest,
 * cfop, unidade }) das peças da OS. Junta TODOS os problemas num 422 só,
 * pra oficina corrigir de uma vez (peça sem NCM, endereço do cliente...).
 */
function montarNfe(os, cliente, f, catalogo, agora = new Date()) {
  const problemas = [];
  if (f.regime_tributario === 'regime_normal') {
    throw new AppError('NF-e para regime normal (Lucro Presumido/Real) ainda não é suportada. Fale com o suporte.', 422);
  }

  // Destinatário: a NF-e exige documento e endereço completo.
  const doc = cnpj.limpar(cliente.cpf_cnpj);
  const dest = { nome_destinatario: String(cliente.nome || '').slice(0, 60) };
  if (/^\d{11}$/.test(doc)) dest.cpf_destinatario = doc;
  else if (cnpj.valido(doc)) dest.cnpj_destinatario = doc;
  else problemas.push({ campo: 'Cliente', erro: 'sem CPF/CNPJ válido no cadastro' });

  const faltaEndereco = [['cep', 'CEP'], ['logradouro', 'logradouro'], ['numero', 'número'],
    ['bairro', 'bairro'], ['municipio', 'município'], ['uf', 'UF']]
    .filter(([c]) => !cliente[c]).map(([, r]) => r);
  if (faltaEndereco.length) {
    problemas.push({ campo: 'Endereço do cliente', erro: `falta ${faltaEndereco.join(', ')}` });
  }
  Object.assign(dest, {
    logradouro_destinatario: cliente.logradouro,
    numero_destinatario: cliente.numero,
    complemento_destinatario: cliente.complemento || undefined,
    bairro_destinatario: cliente.bairro,
    municipio_destinatario: cliente.municipio,
    codigo_municipio_destinatario: cliente.codigo_municipio || undefined,
    uf_destinatario: cliente.uf,
    cep_destinatario: cliente.cep,
    pais_destinatario: 'Brasil',
    telefone_destinatario: digitos(cliente.telefone).replace(/^55(?=\d{10,11}$)/, '') || undefined,
    email_destinatario: cliente.email ? String(cliente.email).slice(0, 60) : undefined,
  });
  // 1 = contribuinte com IE; 2 = contribuinte isento; 9 = não contribuinte.
  const ie = cliente.inscricao_estadual;
  if (ie && ie !== 'ISENTO') {
    dest.indicador_inscricao_estadual_destinatario = 1;
    dest.inscricao_estadual_destinatario = ie;
  } else {
    dest.indicador_inscricao_estadual_destinatario = ie === 'ISENTO' ? 2 : 9;
  }

  const interestadual = Boolean(cliente.uf && f.uf && cliente.uf !== f.uf);
  const { desconto } = descontoPecas(os);
  const descontos = repartir(desconto, os.pecas.map((p) => Number(p.valor_total)));

  const semNcm = [];
  const semCfop = [];
  const items = os.pecas.map((p, i) => {
    const cat = (p.peca_id && catalogo.get(p.peca_id)) || {};
    const ncm = p.ncm || cat.ncm;
    const cest = p.cest || cat.cest;
    let cfop = p.cfop || cat.cfop || f.cfop_padrao;
    if (!ncm) semNcm.push(p.descricao);
    if (!cfop) semCfop.push(p.descricao);
    // Venda pra outro estado: CFOP de 5xxx (dentro do estado) vira 6xxx.
    if (cfop && interestadual && cfop.startsWith('5')) cfop = `6${cfop.slice(1)}`;
    const unidade = (p.unidade || cat.unidade || 'UN').slice(0, 6);
    const quantidade = Number(p.quantidade);
    const unitario = Number(p.valor_unit);
    const pis = f.pis_cofins_cst || '49';
    return {
      numero_item: i + 1,
      codigo_produto: String(p.peca_id || p.id).replace(/-/g, '').slice(0, 60),
      descricao: String(p.descricao).slice(0, 120),
      cfop,
      codigo_ncm: ncm,
      cest: cest || undefined,
      unidade_comercial: unidade,
      quantidade_comercial: quantidade,
      valor_unitario_comercial: unitario,
      unidade_tributavel: unidade,
      quantidade_tributavel: quantidade,
      valor_unitario_tributavel: unitario,
      valor_bruto: dinheiro(p.valor_total),
      valor_desconto: descontos[i] > 0 ? descontos[i] : undefined,
      inclui_no_total: 1,
      icms_origem: 0,
      icms_situacao_tributaria: cest ? (f.csosn_st || '500') : (f.csosn_padrao || '102'),
      pis_situacao_tributaria: pis,
      cofins_situacao_tributaria: pis,
    };
  });
  if (semNcm.length) problemas.push({ campo: 'Peças sem NCM no catálogo', erro: semNcm.join(', ') });
  if (semCfop.length) {
    problemas.push({ campo: 'Peças sem CFOP (e sem CFOP padrão na aba Fiscal)', erro: semCfop.join(', ') });
  }
  if (problemas.length) {
    // A mensagem fica curta: o frontend junta os detalhes ("campo — erro").
    throw new AppError('Não dá para emitir a NF-e', 422, problemas);
  }

  const produtos = dinheiro(items.reduce((t, it) => t + it.valor_bruto, 0));
  const total = dinheiro(produtos - desconto);
  const pagos = (os.pagamentos || []).filter((p) => Number(p.valor) > 0);
  const valores = repartir(total, pagos.map((p) => Number(p.valor)));
  const formas_pagamento = pagos.length
    ? pagos.map((p, i) => ({ forma_pagamento: FORMA_NFE[p.forma] || '99', valor_pagamento: valores[i] }))
    : [{ forma_pagamento: '99', valor_pagamento: total }];

  const veiculo = [os.marca, os.modelo, os.placa].filter(Boolean).join(' ');
  return {
    natureza_operacao: 'Venda de mercadoria',
    data_emissao: isoBrasilia(agora),
    data_entrada_saida: isoBrasilia(agora),
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: interestadual ? 2 : 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    cnpj_emitente: f.cnpj,
    ...dest,
    modalidade_frete: 9,
    valor_frete: 0,
    valor_seguro: 0,
    valor_outras_despesas: 0,
    valor_produtos: produtos,
    valor_desconto: desconto,
    valor_total: total,
    formas_pagamento,
    items,
    informacoes_adicionais_contribuinte: `Peças da OS nº ${os.numero_os}${veiculo ? ` — ${veiculo}` : ''}`.slice(0, 500),
  };
}

// ---------------------------------------------------------------- Emissão

async function carregarOS(osId) {
  const os = require('./os.service');
  const o = await os.buscarPorId(osId);
  const { rows: [cliente] } = await db.query('SELECT * FROM clientes WHERE id = $1', [o.cliente_id]);
  const ids = o.pecas.map((p) => p.peca_id).filter(Boolean);
  const { rows: cat } = ids.length
    ? await db.query('SELECT id, ncm, cest, cfop, unidade FROM pecas WHERE id = ANY($1::uuid[])', [ids])
    : { rows: [] };
  return { os: o, cliente, catalogo: new Map(cat.map((c) => [c.id, c])) };
}

// O que muda por tipo de nota: como montar, o valor e as chamadas na Focus.
const TIPOS = {
  nfse: {
    nome: 'NFS-e',
    montar({ os, cliente, f }) {
      if (!os.servicos.length) throw new AppError('A OS não tem serviços (mão de obra) para a NFS-e', 422);
      const corpo = montarNfse(os, cliente, f);
      if (!(corpo.valor_servico > 0)) throw new AppError('O valor dos serviços da OS está zerado', 422);
      if (corpo.desconto_incondicionado >= corpo.valor_servico) {
        throw new AppError('O desconto cobre todo o valor dos serviços; não há NFS-e a emitir', 422);
      }
      return { corpo, valor: dinheiro(corpo.valor_servico - (corpo.desconto_incondicionado || 0)) };
    },
    emitir: focus.emitirNfsen,
    consultar: focus.consultarNfsen,
    cancelar: focus.cancelarNfsen,
  },
  // Mesmo tipo 'nfse' na tabela de notas; muda o caminho na Focus. Só
  // produção (o sistema da prefeitura não tem ambiente de teste).
  nfse_municipal: {
    nome: 'NFS-e',
    montar({ os, cliente, f }) {
      if (!os.servicos.length) throw new AppError('A OS não tem serviços (mão de obra) para a NFS-e', 422);
      const corpo = montarNfseMunicipal(os, cliente, f);
      const s = corpo.servico;
      if (!(s.valor_servicos > 0)) throw new AppError('O valor dos serviços da OS está zerado', 422);
      if (s.desconto_incondicionado >= s.valor_servicos) {
        throw new AppError('O desconto cobre todo o valor dos serviços; não há NFS-e a emitir', 422);
      }
      return { corpo, valor: dinheiro(s.valor_servicos - (s.desconto_incondicionado || 0)) };
    },
    emitir: focus.emitirNfse,
    consultar: focus.consultarNfse,
    cancelar: focus.cancelarNfse,
  },
  nfe: {
    nome: 'NF-e',
    montar({ os, cliente, f, catalogo }) {
      if (!os.pecas.length) throw new AppError('A OS não tem peças para a NF-e', 422);
      const corpo = montarNfe(os, cliente, f, catalogo);
      if (!(corpo.valor_total > 0)) throw new AppError('O valor das peças da OS está zerado', 422);
      return { corpo, valor: corpo.valor_total };
    },
    emitir: focus.emitirNfe,
    consultar: focus.consultarNfe,
    cancelar: focus.cancelarNfe,
  },
};

/** Variante da nota já emitida: NFS-e municipal leva 'prestador' no corpo. */
async function tipoDaNota(nota) {
  if (nota.tipo !== 'nfse') return TIPOS[nota.tipo];
  const { rows: [r] } = await db.query(
    "SELECT payload_enviado ? 'prestador' AS municipal FROM notas_fiscais WHERE id = $1", [nota.id]);
  return r?.municipal ? TIPOS.nfse_municipal : TIPOS.nfse;
}

/**
 * Emite a nota de um tipo pra OS. `oficinaId` e `userId` vêm do JWT.
 * Devolve a nota (status 'processando', 'autorizada' ou 'erro' com o motivo).
 */
async function emitir(osId, tipo, { oficinaId, userId }) {
  if (!TIPOS[tipo]) throw new AppError('Tipo de nota inválido', 422);

  const cred = await fiscal.credenciais(oficinaId);
  const { fiscal: f } = cred;
  let { ambiente, token } = cred;
  let T = TIPOS[tipo];
  if (tipo === 'nfse' && f.nfse_municipal) {
    if (!f.prefeitura_configurada) {
      throw new AppError('Informe o login e a senha do site da prefeitura em Configurações > Fiscal', 422);
    }
    T = TIPOS.nfse_municipal;
    ambiente = 'producao';
    token = await fiscal.tokenDoAmbiente(oficinaId, 'producao');
  }
  const { os, cliente, catalogo } = await carregarOS(osId);
  if (!STATUS_OS_EMITIVEL.includes(os.status)) {
    throw new AppError('Finalize a OS antes de emitir a nota fiscal', 422);
  }
  const { corpo, valor } = T.montar({ os, cliente, f, catalogo });

  let nota;
  try {
    nota = await db.withTransaction(async (client) => {
      const { rows: [n] } = await client.query(
        `INSERT INTO notas_fiscais (os_id, tipo, ambiente, ref, valor, payload_enviado, emitida_por)
         VALUES ($1, $2, $3, 'tmp-' || gen_random_uuid(), $4, $5, $6)
         RETURNING id`,
        [osId, tipo, ambiente, valor, corpo, userId],
      );
      const ref = refDaNota(n.id);
      await client.query('UPDATE notas_fiscais SET ref = $2 WHERE id = $1', [n.id, ref]);
      await client.query('INSERT INTO public.notas_fiscais_ref (ref, oficina_id) VALUES ($1, $2)', [ref, oficinaId]);
      return { id: n.id, ref };
    });
  } catch (err) {
    if (err.code === '23505') {
      throw AppError.conflict(`Esta OS já tem uma ${T.nome} em processamento ou autorizada`);
    }
    throw err;
  }

  try {
    const r = await T.emitir(nota.ref, corpo, { token, ambiente });
    await aplicarResposta(nota.id, tipo, r, ambiente);
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

/** Aplica o retorno da Focus (emissão, consulta ou cancelamento) na nota. */
async function aplicarResposta(notaId, tipo, r, ambiente) {
  const st = r?.status;
  if (st === 'autorizado') {
    const nfe = tipo === 'nfe';
    const chave = nfe
      ? String(r.chave_nfe || '').replace(/^NFe/, '') || null
      : r.chave_nfse || (String(r.url || '').match(/[?&]chave=([^&]+)/) || [])[1] || null;
    const pdf = nfe ? focus.urlArquivo(r.caminho_danfe, ambiente) : (r.url_danfse || r.url || null);
    await db.query(
      `UPDATE notas_fiscais SET status = 'autorizada', numero = $2, serie = $3, chave = $4,
              codigo_verificacao = $5, url_pdf = $6, url_xml = $7, mensagem_erro = NULL,
              resposta = $8, autorizada_em = COALESCE(autorizada_em, now())
        WHERE id = $1`,
      [notaId, r.numero ?? null, (nfe ? r.serie : r.serie_rps) ?? null, chave, r.codigo_verificacao ?? null,
        pdf, focus.urlArquivo(r.caminho_xml_nota_fiscal, ambiente), r],
    );
  } else if (st === 'erro_autorizacao' || st === 'negado' || st === 'denegado') {
    const msg = Array.isArray(r.erros) && r.erros.length
      ? textoErrosFocus(r.erros)
      : [r.status_sefaz, r.mensagem_sefaz].filter(Boolean).join(' — ') || 'Nota rejeitada pelo emissor';
    await db.query(
      `UPDATE notas_fiscais SET status = 'erro', mensagem_erro = $2, resposta = $3 WHERE id = $1`,
      [notaId, msg, r],
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
  try {
    const r = await (await tipoDaNota(nota)).consultar(nota.ref, { token, ambiente: nota.ambiente });
    await aplicarResposta(nota.id, nota.tipo, r, nota.ambiente);
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

/**
 * Cancela uma nota autorizada. Síncrono na Focus: devolve a nota já
 * cancelada, ou 422 com o motivo da prefeitura/SEFAZ (ex.: fora do prazo).
 */
async function cancelar(notaId, justificativa, oficinaId) {
  const nota = await buscar(notaId);
  if (nota.status !== 'autorizada') throw new AppError('Só dá para cancelar nota autorizada', 422);
  const token = await fiscal.tokenDoAmbiente(oficinaId, nota.ambiente);
  const r = await (await tipoDaNota(nota)).cancelar(nota.ref, justificativa, { token, ambiente: nota.ambiente });
  if (r?.status !== 'cancelado') {
    const msg = [r?.status_sefaz, r?.mensagem_sefaz].filter(Boolean).join(' — ')
      || (Array.isArray(r?.erros) && textoErrosFocus(r.erros)) || 'Cancelamento recusado';
    throw new AppError(`Cancelamento recusado: ${msg}`, 422);
  }
  await db.query(
    `UPDATE notas_fiscais SET status = 'cancelada', justificativa_cancelamento = $2,
            cancelada_em = now(), resposta = $3 WHERE id = $1`,
    [nota.id, justificativa, r]);
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
  emitir, atualizar, cancelar, atualizarPorRef, reconsultarPendentes, buscar, listarDaOS, listar,
  montarNfse, montarNfseMunicipal, montarNfe, valoresServico, repartir, aplicarResposta, refDaNota,
};
