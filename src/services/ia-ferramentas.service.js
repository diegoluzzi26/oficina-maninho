'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');
const clientes = require('./clientes.service');
const carros = require('./carros.service');
const os = require('./os.service');
const relatorios = require('./relatorios.service');
const despesas = require('./despesas.service');
const followup = require('./followup.service');

/**
 * Ferramentas que o consultor (Claude) pode chamar para consultar os dados
 * da oficina. Todas rodam dentro do contexto da requisição, então as queries
 * já caem no schema da oficina do usuário logado (search_path vem do JWT) —
 * o modelo nunca escolhe a oficina.
 *
 * Dois grupos:
 *  - consulta: só leitura, devolvem dados resumidos e limitados;
 *  - propor_*: NÃO gravam nada. Validam e devolvem uma proposta que o
 *    frontend mostra com botão de confirmar; quem grava é o usuário,
 *    pelas rotas normais do sistema.
 */

const LIMITE_LINHAS = 50;
const LIMITE_CARACTERES = 15000;

const uuid = { type: 'string', description: 'UUID' };
const anoMes = {
  ano: { type: 'integer', description: 'Ano (ex.: 2026). Vazio = mês atual.' },
  mes: { type: 'integer', minimum: 1, maximum: 12, description: 'Mês 1-12. Vazio = mês atual.' },
};
const limite = { type: 'integer', minimum: 1, maximum: LIMITE_LINHAS, description: `Máx. de linhas (padrão 20, teto ${LIMITE_LINHAS}).` };
const tipoFollowup = { type: 'string', enum: ['manutencao', 'reativacao', 'promocao', 'avaliacao'] };

const DEFINICOES = [
  {
    name: 'buscar_clientes',
    description: 'Procura clientes por nome, telefone, CPF/CNPJ, número do cliente ou placa. Devolve id, nome, telefone e contagem de carros/OS.',
    input_schema: {
      type: 'object',
      properties: { busca: { type: 'string', description: 'Termo de busca. Vazio = clientes mais recentes.' }, limite },
    },
  },
  {
    name: 'detalhes_cliente',
    description: 'Cadastro completo de um cliente, seus veículos, últimas ordens de serviço e histórico de follow-up/WhatsApp.',
    input_schema: { type: 'object', properties: { cliente_id: uuid }, required: ['cliente_id'] },
  },
  {
    name: 'historico_veiculo',
    description: 'Histórico de um veículo: OS, serviços realizados, peças trocadas, total gasto e última visita. Informe carro_id ou placa.',
    input_schema: {
      type: 'object',
      properties: { carro_id: uuid, placa: { type: 'string' } },
    },
  },
  {
    name: 'listar_ordens',
    description: 'Lista ordens de serviço com filtros. Status possíveis: aberta, em_andamento, finalizada, paga, negada.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['aberta', 'em_andamento', 'finalizada', 'paga', 'negada'] },
        cliente_id: uuid,
        busca: { type: 'string', description: 'Nome do cliente, placa ou número da OS.' },
        ...anoMes,
        limite,
      },
    },
  },
  {
    name: 'detalhes_ordem',
    description: 'Uma ordem de serviço completa (serviços, peças, pagamentos). Informe os_id ou numero_os.',
    input_schema: {
      type: 'object',
      properties: { os_id: uuid, numero_os: { type: 'integer' } },
    },
  },
  {
    name: 'painel_financeiro',
    description: 'Painel do mês: receita, despesa, lucro, projeção, meta, quantidade de OS, ticket médio, em aberto, top serviços e comparativo com o mês anterior.',
    input_schema: { type: 'object', properties: { ...anoMes } },
  },
  {
    name: 'faturamento_periodo',
    description: 'Faturamento (OS pagas) num período: resumo, evolução mês a mês e serviços mais vendidos. Datas YYYY-MM-DD; vazio = últimos 12 meses.',
    input_schema: {
      type: 'object',
      properties: { inicio: { type: 'string', format: 'date' }, fim: { type: 'string', format: 'date' } },
    },
  },
  {
    name: 'listar_despesas',
    description: 'Despesas da oficina (não inclui as pessoais). Status: pendente, paga, atrasada. Datas YYYY-MM-DD.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pendente', 'paga', 'atrasada'] },
        inicio: { type: 'string', format: 'date' },
        fim: { type: 'string', format: 'date' },
        busca: { type: 'string' },
        limite,
      },
    },
  },
  {
    name: 'fila_followup',
    description: 'Fila de follow-up/lembretes de WhatsApp. Status: pendente, enviado, respondeu, converteu, dispensado.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pendente', 'enviado', 'respondeu', 'converteu', 'dispensado'] },
        tipo: tipoFollowup,
        busca: { type: 'string', description: 'Nome do cliente ou placa.' },
        limite,
      },
    },
  },
  {
    name: 'metricas_followup',
    description: 'Métricas do follow-up nos últimos N dias: gerados, enviados, respondidos, convertidos, por tipo.',
    input_schema: { type: 'object', properties: { periodo: { type: 'integer', minimum: 1, maximum: 365 } } },
  },
  {
    name: 'propor_mensagem_whatsapp',
    description: 'Propõe uma mensagem de WhatsApp para um cliente. NÃO envia: o usuário revisa e decide abrir no WhatsApp. Use depois de achar o cliente_id.',
    input_schema: {
      type: 'object',
      properties: {
        cliente_id: uuid,
        mensagem: { type: 'string', description: 'Texto final, pronto para enviar, em português.' },
      },
      required: ['cliente_id', 'mensagem'],
    },
  },
  {
    name: 'propor_followup',
    description: 'Propõe colocar um cliente na fila de follow-up (Kanban). NÃO grava: o usuário confirma no chat. Use depois de achar o cliente_id (e carro_id, se for sobre um veículo).',
    input_schema: {
      type: 'object',
      properties: {
        cliente_id: uuid,
        carro_id: uuid,
        tipo: tipoFollowup,
        mensagem: { type: 'string', description: 'Mensagem de WhatsApp (mín. 10 caracteres).' },
        agendado_para: { type: 'string', format: 'date', description: 'Data YYYY-MM-DD. Vazio = hoje.' },
        notas: { type: 'string', description: 'Observação interna (opcional).' },
      },
      required: ['cliente_id', 'tipo', 'mensagem'],
    },
  },
];

// ------------------------------------------------------------- helpers

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function exigirUuid(v, campo) {
  if (!v || !UUID_RE.test(String(v))) throw new AppError(`${campo} inválido`, 422);
  return String(v);
}
function dataOpcional(v, campo) {
  if (v == null || v === '') return undefined;
  if (!DATA_RE.test(String(v))) throw new AppError(`${campo} deve ser YYYY-MM-DD`, 422);
  return String(v);
}
function lim(v, padrao = 20) {
  const n = Number(v) || padrao;
  return Math.max(1, Math.min(LIMITE_LINHAS, Math.trunc(n)));
}
function textoOpcional(v, max = 120) {
  if (v == null) return undefined;
  const s = String(v).trim().slice(0, max);
  return s || undefined;
}
function inteiroOpcional(v, min, max) {
  if (v == null || v === '') return undefined;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

// Tira campos pesados/irrelevantes pra economizar tokens.
function enxutoOS(o) {
  return {
    id: o.id, numero_os: o.numero_os, status: o.status,
    cliente_id: o.cliente_id, cliente_nome: o.cliente_nome,
    carro_id: o.carro_id, placa: o.placa, modelo: o.modelo, marca: o.marca,
    aberta_em: o.aberta_em, fechada_em: o.fechada_em, paga_em: o.paga_em,
    valor_total: o.valor_total == null ? null : Number(o.valor_total),
    valor_pago: o.valor_pago == null ? null : Number(o.valor_pago),
    forma_pagamento: o.forma_pagamento,
  };
}
function enxutoFollowup(f) {
  return {
    id: f.id, status: f.status, tipo: f.tipo,
    cliente_id: f.cliente_id, cliente_nome: f.cliente_nome, placa: f.placa,
    agendado_para: f.agendado_para, enviado_em: f.enviado_em,
    respondido_em: f.respondido_em, regra_nome: f.regra_nome,
    mensagem: f.mensagem && String(f.mensagem).slice(0, 300),
  };
}

function numeroWhatsApp(telefone) {
  const d = String(telefone || '').replace(/\D/g, '');
  if (!d) return null;
  return d.length <= 11 ? `55${d}` : d;
}

// ------------------------------------------------------------- consultas

const EXECUTORES = {
  async buscar_clientes(i) {
    const r = await clientes.listar({ pagina: 1, por_pagina: lim(i.limite), busca: textoOpcional(i.busca) });
    return {
      total: r.paginacao.total,
      clientes: r.dados.map((c) => ({
        id: c.id, numero_cliente: c.numero_cliente, nome: c.nome, telefone: c.telefone,
        qtd_carros: c.qtd_carros, qtd_os: c.qtd_os,
      })),
    };
  },

  async detalhes_cliente(i) {
    const id = exigirUuid(i.cliente_id, 'cliente_id');
    const [cli, ordens, hist] = await Promise.all([
      clientes.buscarPorId(id),
      os.listar({ pagina: 1, por_pagina: 15, cliente_id: id }),
      followup.historicoDoCliente(id),
    ]);
    return {
      cliente: {
        id: cli.id, numero_cliente: cli.numero_cliente, nome: cli.nome, telefone: cli.telefone,
        email: cli.email, data_nascimento: cli.data_nascimento, observacoes: cli.observacoes,
        municipio: cli.municipio, uf: cli.uf, criado_em: cli.criado_em,
      },
      carros: cli.carros.map((c) => ({
        id: c.id, placa: c.placa, marca: c.marca, modelo: c.modelo, ano: c.ano, km_atual: c.km_atual,
      })),
      total_os: ordens.paginacao.total,
      ultimas_os: ordens.dados.map(enxutoOS),
      followups: hist.historico.slice(0, 15).map(enxutoFollowup),
    };
  },

  async historico_veiculo(i) {
    let id = i.carro_id ? exigirUuid(i.carro_id, 'carro_id') : null;
    if (!id) {
      const placa = textoOpcional(i.placa, 10);
      if (!placa) throw new AppError('Informe carro_id ou placa', 422);
      const achados = await carros.listar({ busca: placa });
      if (!achados.length) return { encontrado: false, mensagem: `Nenhum veículo com placa ${placa}` };
      if (achados.length > 1) {
        return {
          encontrado: false,
          mensagem: 'Mais de um veículo bate com essa placa; escolha um carro_id.',
          opcoes: achados.slice(0, 10).map((c) => ({ id: c.id, placa: c.placa, modelo: c.modelo, cliente_nome: c.cliente_nome })),
        };
      }
      id = achados[0].id;
    }
    const h = await carros.historico(id);
    return {
      carro: {
        id: h.carro.id, placa: h.carro.placa, marca: h.carro.marca, modelo: h.carro.modelo,
        ano: h.carro.ano, cliente_id: h.carro.cliente_id, cliente_nome: h.carro.cliente_nome,
      },
      resumo: h.resumo,
      ordens: h.ordens.slice(0, 20),
      servicos_realizados: h.servicos_realizados.slice(0, 30),
      pecas_trocadas: h.pecas_trocadas.slice(0, 30),
    };
  },

  async listar_ordens(i) {
    const ano = inteiroOpcional(i.ano, 2000, 2100);
    const mes = inteiroOpcional(i.mes, 1, 12);
    const r = await os.listar({
      pagina: 1, por_pagina: lim(i.limite),
      status: textoOpcional(i.status, 20),
      cliente_id: i.cliente_id ? exigirUuid(i.cliente_id, 'cliente_id') : undefined,
      busca: textoOpcional(i.busca),
      ano: ano && mes ? ano : undefined,
      mes: ano && mes ? mes : undefined,
    });
    return { total: r.paginacao.total, ordens: r.dados.map(enxutoOS) };
  },

  async detalhes_ordem(i) {
    let id = i.os_id ? exigirUuid(i.os_id, 'os_id') : null;
    if (!id) {
      const numero = inteiroOpcional(i.numero_os, 1, 1e9);
      if (!numero) throw new AppError('Informe os_id ou numero_os', 422);
      const { rows } = await db.query('SELECT id FROM ordens_servico WHERE numero_os = $1', [numero]);
      if (!rows[0]) return { encontrado: false, mensagem: `OS ${numero} não encontrada` };
      id = rows[0].id;
    }
    const o = await os.buscarPorId(id);
    return {
      ...enxutoOS(o),
      km_entrada: o.km_entrada,
      observacoes: o.observacoes,
      desconto: o.desconto == null ? null : Number(o.desconto),
      servicos: o.servicos.map((s) => ({
        nome: s.nome_servico, quantidade: Number(s.quantidade), valor_total: Number(s.valor_total),
      })),
      pecas: o.pecas.map((p) => ({
        descricao: p.descricao, quantidade: Number(p.quantidade), valor_total: Number(p.valor_total),
      })),
      pagamentos: o.pagamentos,
    };
  },

  async painel_financeiro(i) {
    return relatorios.painelMes({
      ano: inteiroOpcional(i.ano, 2000, 2100),
      mes: inteiroOpcional(i.mes, 1, 12),
    });
  },

  async faturamento_periodo(i) {
    const filtros = { inicio: dataOpcional(i.inicio, 'inicio'), fim: dataOpcional(i.fim, 'fim') };
    const [resumo, porMes, servicos] = await Promise.all([
      relatorios.resumo(filtros),
      relatorios.faturamentoPorPeriodo(filtros, 'month'),
      relatorios.servicosMaisVendidos(filtros),
    ]);
    return {
      resumo,
      por_mes: Array.isArray(porMes) ? porMes.slice(-24) : porMes,
      servicos_mais_vendidos: Array.isArray(servicos) ? servicos.slice(0, 15) : servicos,
    };
  },

  async listar_despesas(i) {
    const r = await despesas.listarDespesas({
      escopo: 'oficina',
      status: textoOpcional(i.status, 20),
      inicio: dataOpcional(i.inicio, 'inicio'),
      fim: dataOpcional(i.fim, 'fim'),
      busca: textoOpcional(i.busca),
      pagina: 1,
      por_pagina: lim(i.limite),
    });
    return {
      total: r.paginacao.total,
      soma_valor_do_filtro: r.paginacao.total_valor,
      despesas: r.dados.map((d) => ({
        id: d.id, descricao: d.descricao, valor: d.valor, status: d.status,
        categoria: d.categoria_nome, fornecedor: d.fornecedor_nome,
        competencia: d.competencia, vencimento: d.vencimento, pago_em: d.pago_em,
      })),
    };
  },

  async fila_followup(i) {
    const r = await followup.listarFila({
      status: textoOpcional(i.status, 20),
      tipo: textoOpcional(i.tipo, 20),
      busca: textoOpcional(i.busca),
      pagina: 1,
      por_pagina: lim(i.limite),
    });
    return { total: r.paginacao.total, itens: r.dados.map(enxutoFollowup) };
  },

  async metricas_followup(i) {
    return followup.metricas({ periodo: inteiroOpcional(i.periodo, 1, 365) || 30 });
  },

  // ----------------------------------------------------------- propostas

  async propor_mensagem_whatsapp(i) {
    const cli = await clientes.buscarPorId(exigirUuid(i.cliente_id, 'cliente_id'));
    const mensagem = String(i.mensagem || '').trim().slice(0, 2000);
    if (!mensagem) throw new AppError('mensagem vazia', 422);
    const numero = numeroWhatsApp(cli.telefone);
    return {
      proposta: {
        tipo: 'whatsapp',
        cliente_id: cli.id,
        cliente_nome: cli.nome,
        telefone: cli.telefone || null,
        numero_whatsapp: numero,
        mensagem,
      },
      resultado: numero
        ? 'Proposta mostrada ao usuário com botão para abrir no WhatsApp. Nada foi enviado.'
        : 'Cliente sem telefone: proposta mostrada só para copiar. Nada foi enviado.',
    };
  },

  async propor_followup(i) {
    const cli = await clientes.buscarPorId(exigirUuid(i.cliente_id, 'cliente_id'));
    let carro = null;
    if (i.carro_id) {
      const carroId = exigirUuid(i.carro_id, 'carro_id');
      carro = cli.carros.find((c) => c.id === carroId);
      if (!carro) throw new AppError('Esse carro não pertence ao cliente', 422);
    }
    const tipos = ['manutencao', 'reativacao', 'promocao', 'avaliacao'];
    if (!tipos.includes(i.tipo)) throw new AppError(`tipo deve ser um de: ${tipos.join(', ')}`, 422);
    const mensagem = String(i.mensagem || '').trim().slice(0, 2000);
    if (mensagem.length < 10) throw new AppError('mensagem precisa de pelo menos 10 caracteres', 422);
    const notas = textoOpcional(i.notas, 500);
    return {
      proposta: {
        tipo: 'followup',
        cliente_id: cli.id,
        cliente_nome: cli.nome,
        carro_id: carro ? carro.id : null,
        carro_rotulo: carro ? [carro.placa, carro.modelo].filter(Boolean).join(' · ') : null,
        tipo_followup: i.tipo,
        mensagem,
        agendado_para: dataOpcional(i.agendado_para, 'agendado_para') || null,
        ...(notas ? { notas } : {}),
      },
      resultado: 'Proposta mostrada ao usuário com botão de confirmar. Ainda NÃO está na fila.',
    };
  },
};

/**
 * Executa uma ferramenta. Nunca lança: erro vira resultado com is_error,
 * pra o modelo poder se corrigir (ex.: id errado) sem derrubar a conversa.
 * Devolve { conteudo, erro, proposta? }.
 */
async function executar(nome, entrada) {
  const fn = EXECUTORES[nome];
  if (!fn) return { conteudo: `Ferramenta desconhecida: ${nome}`, erro: true };
  try {
    const r = await fn(entrada || {});
    let proposta;
    let dados = r;
    if (r && r.proposta) { proposta = r.proposta; dados = r.resultado; }
    let conteudo = typeof dados === 'string' ? dados : JSON.stringify(dados);
    if (conteudo.length > LIMITE_CARACTERES) {
      conteudo = `${conteudo.slice(0, LIMITE_CARACTERES)}… [resultado cortado; refine os filtros]`;
    }
    return { conteudo, erro: false, proposta };
  } catch (e) {
    const msg = e instanceof AppError ? e.message : 'Erro ao consultar os dados';
    if (!(e instanceof AppError)) console.error(`[ia] ferramenta ${nome} falhou:`, e.message);
    return { conteudo: msg, erro: true };
  }
}

module.exports = { DEFINICOES, executar, LIMITE_LINHAS };
