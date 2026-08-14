'use strict';
const db = require('../config/db');

/**
 * Análises do lado financeiro.
 *
 * Critério de data, importante entender:
 * - "pago" (fluxo de caixa) usa pago_em / paga_em — dinheiro que entrou/saiu
 * - "competência" usa competencia — a qual mês a despesa pertence
 *
 * Uma compra de julho paga em agosto conta na competência de julho, mas no
 * caixa de agosto. Os dois são úteis: um mostra o resultado do mês, o outro
 * mostra o dinheiro disponível.
 */

function intervalo({ inicio, fim }, coluna = 'competencia') {
  const params = [];
  let clause = '';
  if (inicio) { params.push(inicio); clause += ` AND ${coluna} >= $${params.length}::date`; }
  if (fim) { params.push(fim); clause += ` AND ${coluna} <= $${params.length}::date`; }
  if (!inicio && !fim) clause = ` AND ${coluna} >= (now() - interval '12 months')::date`;
  // Painel/Financeiro é da OFICINA — despesas pessoais ficam confinadas à
  // tela Pessoal (via painelPessoal em despesas.service.js).
  clause += ` AND escopo = 'oficina'`;
  return { clause, params };
}

async function resumo(filtros) {
  const { clause, params } = intervalo(filtros);

  const { rows } = await db.query(
    `SELECT
       COALESCE(sum(valor) FILTER (WHERE status = 'paga'), 0)::numeric      AS total_pago,
       COALESCE(sum(valor) FILTER (WHERE status = 'pendente'), 0)::numeric  AS total_pendente,
       COALESCE(sum(valor) FILTER (WHERE status = 'atrasada'), 0)::numeric  AS total_atrasado,
       COALESCE(sum(valor), 0)::numeric                                     AS total_geral,
       count(*)::int                                                        AS quantidade,
       count(*) FILTER (WHERE status = 'atrasada')::int                     AS qtd_atrasadas
     FROM vw_despesas WHERE 1=1 ${clause}`,
    params,
  );
  const r = rows[0];
  return {
    total_pago: Number(r.total_pago),
    total_pendente: Number(r.total_pendente),
    total_atrasado: Number(r.total_atrasado),
    total_geral: Number(r.total_geral),
    quantidade: r.quantidade,
    qtd_atrasadas: r.qtd_atrasadas,
  };
}

async function porCategoria(filtros) {
  const { clause, params } = intervalo(filtros);
  const { rows } = await db.query(
    `SELECT COALESCE(categoria_nome, 'Sem categoria') AS categoria,
            COALESCE(categoria_cor, '#94a3b8')        AS cor,
            count(*)::int                             AS quantidade,
            COALESCE(sum(valor), 0)::numeric          AS total
       FROM vw_despesas WHERE 1=1 ${clause}
      GROUP BY categoria_nome, categoria_cor
      ORDER BY total DESC`,
    params,
  );
  const total = rows.reduce((s, r) => s + Number(r.total), 0);
  return rows.map((r) => ({
    categoria: r.categoria,
    cor: r.cor,
    quantidade: r.quantidade,
    total: Number(r.total),
    // Percentual pré-calculado: o gráfico de pizza precisa e evita
    // recalcular no frontend com risco de divergir.
    percentual: total > 0 ? Number(((Number(r.total) / total) * 100).toFixed(1)) : 0,
  }));
}

const ROTULO_FORMA = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  boleto: 'Boleto',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  cheque: 'Cheque',
  outro: 'Outro',
};

async function porFormaPagamento(filtros) {
  const { clause, params } = intervalo(filtros);
  const { rows } = await db.query(
    `SELECT forma, count(*)::int AS quantidade, COALESCE(sum(valor),0)::numeric AS total
       FROM vw_despesas WHERE 1=1 ${clause}
      GROUP BY forma ORDER BY total DESC`,
    params,
  );
  const total = rows.reduce((s, r) => s + Number(r.total), 0);
  return rows.map((r) => ({
    forma: r.forma,
    rotulo: ROTULO_FORMA[r.forma] || r.forma,
    quantidade: r.quantidade,
    total: Number(r.total),
    percentual: total > 0 ? Number(((Number(r.total) / total) * 100).toFixed(1)) : 0,
  }));
}

async function porFornecedor(filtros) {
  const { clause, params } = intervalo(filtros);
  params.push(filtros.limite || 10);
  const { rows } = await db.query(
    `SELECT COALESCE(fornecedor_nome, 'Sem fornecedor') AS fornecedor,
            count(*)::int                               AS quantidade,
            COALESCE(sum(valor),0)::numeric             AS total
       FROM vw_despesas WHERE 1=1 ${clause}
      GROUP BY fornecedor_nome
      ORDER BY total DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({ ...r, total: Number(r.total) }));
}

/** Evolução mensal: despesa por competência. */
async function evolucaoMensal(filtros) {
  const { clause, params } = intervalo(filtros);
  const { rows } = await db.query(
    `SELECT date_trunc('month', competencia)::date AS mes,
            COALESCE(sum(valor),0)::numeric        AS total,
            COALESCE(sum(valor) FILTER (WHERE status='paga'),0)::numeric AS pago,
            count(*)::int                          AS quantidade
       FROM vw_despesas WHERE 1=1 ${clause}
      GROUP BY 1 ORDER BY 1`,
    params,
  );
  return rows.map((r) => ({
    mes: r.mes,
    total: Number(r.total),
    pago: Number(r.pago),
    quantidade: r.quantidade,
  }));
}

/** Fluxo de caixa: receita de OS pagas vs despesas pagas. */
async function fluxoCaixa(filtros) {
  const params = [];
  let clause = '';
  if (filtros.inicio) { params.push(filtros.inicio); clause += ` AND mes >= date_trunc('month',$${params.length}::date)`; }
  if (filtros.fim) { params.push(filtros.fim); clause += ` AND mes <= date_trunc('month',$${params.length}::date)`; }
  if (!filtros.inicio && !filtros.fim) clause = " AND mes >= date_trunc('month', now() - interval '12 months')";

  const { rows } = await db.query(
    `SELECT mes, receita, despesa, lucro, qtd_os, qtd_despesas
       FROM vw_fluxo_mensal WHERE 1=1 ${clause} ORDER BY mes`,
    params,
  );

  const dados = rows.map((r) => ({
    mes: r.mes,
    receita: Number(r.receita),
    despesa: Number(r.despesa),
    lucro: Number(r.lucro),
    qtd_os: r.qtd_os,
    qtd_despesas: r.qtd_despesas,
    // Margem só faz sentido com receita; sem ela, null em vez de divisão por zero
    margem: Number(r.receita) > 0
      ? Number(((Number(r.lucro) / Number(r.receita)) * 100).toFixed(1))
      : null,
  }));

  const totais = dados.reduce((acc, d) => ({
    receita: acc.receita + d.receita,
    despesa: acc.despesa + d.despesa,
    lucro: acc.lucro + d.lucro,
  }), { receita: 0, despesa: 0, lucro: 0 });

  return {
    dados,
    totais: {
      ...totais,
      margem: totais.receita > 0
        ? Number(((totais.lucro / totais.receita) * 100).toFixed(1))
        : null,
    },
  };
}

/**
 * Fluxo diário — entradas e saídas por dia dentro de uma janela.
 * Default: últimos 30 dias.
 */
async function fluxoDiario(filtros) {
  const params = [];
  let clause = '';
  if (filtros.inicio) { params.push(filtros.inicio); clause += ` AND dia >= $${params.length}::date`; }
  if (filtros.fim)    { params.push(filtros.fim);    clause += ` AND dia <= $${params.length}::date`; }
  if (!filtros.inicio && !filtros.fim) clause = ` AND dia >= (CURRENT_DATE - interval '30 days')::date`;

  const { rows } = await db.query(
    `SELECT dia, entrada, saida, liquido
       FROM vw_fluxo_diario WHERE 1=1 ${clause} ORDER BY dia`,
    params,
  );
  return rows.map((r) => ({
    dia: r.dia,
    entrada: Number(r.entrada),
    saida: Number(r.saida),
    liquido: Number(r.liquido),
  }));
}

/** Fluxo semanal (segunda a domingo, ISO). Default: últimas 12 semanas. */
async function fluxoSemanal(filtros) {
  const params = [];
  let clause = '';
  if (filtros.inicio) { params.push(filtros.inicio); clause += ` AND semana >= date_trunc('week',$${params.length}::date)::date`; }
  if (filtros.fim)    { params.push(filtros.fim);    clause += ` AND semana <= date_trunc('week',$${params.length}::date)::date`; }
  if (!filtros.inicio && !filtros.fim) clause = ` AND semana >= date_trunc('week', CURRENT_DATE - interval '12 weeks')::date`;

  const { rows } = await db.query(
    `SELECT semana, entrada, saida, liquido
       FROM vw_fluxo_semanal WHERE 1=1 ${clause} ORDER BY semana`,
    params,
  );
  return rows.map((r) => ({
    semana: r.semana,
    entrada: Number(r.entrada),
    saida: Number(r.saida),
    liquido: Number(r.liquido),
  }));
}

/**
 * Resumo "hoje" + "esta semana" pro cabeçalho do Financeiro e do Dashboard.
 * Uma consulta única com CTEs em vez de várias round-trips — a tela abre
 * mais rápido e a leitura fica atômica dentro do request.
 */
async function fluxoAtual() {
  const { rows } = await db.query(`
    WITH hoje AS (
      SELECT COALESCE(SUM(entrada),0)::numeric AS entrada,
             COALESCE(SUM(saida),0)::numeric   AS saida
        FROM vw_fluxo_diario
       WHERE dia = CURRENT_DATE
    ),
    semana AS (
      SELECT COALESCE(SUM(entrada),0)::numeric AS entrada,
             COALESCE(SUM(saida),0)::numeric   AS saida
        FROM vw_fluxo_diario
       WHERE dia >= date_trunc('week', CURRENT_DATE)::date
         AND dia <= CURRENT_DATE
    )
    SELECT hoje.entrada  AS hoje_entrada,
           hoje.saida    AS hoje_saida,
           semana.entrada AS semana_entrada,
           semana.saida   AS semana_saida
      FROM hoje, semana
  `);
  const r = rows[0];
  return {
    hoje: {
      entrada: Number(r.hoje_entrada),
      saida: Number(r.hoje_saida),
      liquido: Number(r.hoje_entrada) - Number(r.hoje_saida),
    },
    semana: {
      entrada: Number(r.semana_entrada),
      saida: Number(r.semana_saida),
      liquido: Number(r.semana_entrada) - Number(r.semana_saida),
      // Semana ISO (segunda-domingo) usada aqui — a UI mostra o intervalo
      inicio: null,
      fim: null,
    },
  };
}

/** Payload único para a tela de análises. */
async function painelFinanceiro(filtros) {
  const [res, cat, forma, forn, evol, fluxo] = await Promise.all([
    resumo(filtros),
    porCategoria(filtros),
    porFormaPagamento(filtros),
    porFornecedor(filtros),
    evolucaoMensal(filtros),
    fluxoCaixa(filtros),
  ]);
  return {
    resumo: res,
    por_categoria: cat,
    por_forma: forma,
    por_fornecedor: forn,
    evolucao: evol,
    fluxo_caixa: fluxo,
  };
}

module.exports = {
  resumo, porCategoria, porFormaPagamento, porFornecedor,
  evolucaoMensal, fluxoCaixa, painelFinanceiro,
  fluxoDiario, fluxoSemanal, fluxoAtual,
};
