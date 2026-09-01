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

function intervalo({ inicio, fim, escopo }, coluna = 'competencia') {
  const params = [];
  let clause = '';
  if (inicio) { params.push(inicio); clause += ` AND ${coluna} >= $${params.length}::date`; }
  if (fim) { params.push(fim); clause += ` AND ${coluna} <= $${params.length}::date`; }
  if (!inicio && !fim) clause = ` AND ${coluna} >= (now() - interval '12 months')::date`;
  // Escopo: 'oficina' (default), 'pessoal', ou 'ambos' pra ver tudo junto.
  const esc = escopo || 'oficina';
  if (esc === 'oficina' || esc === 'pessoal') {
    params.push(esc);
    clause += ` AND escopo = $${params.length}`;
  }
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

/**
 * Fluxo de caixa: receita de OS pagas vs despesas pagas, agrupadas por mês.
 * O escopo do filtro afeta as DESPESAS (oficina/pessoal/ambos). Receita
 * (OSs pagas) só existe pra oficina, então quando escopo='pessoal' a
 * receita fica zerada — o que faz sentido.
 */
async function fluxoCaixa(filtros) {
  const params = [];
  let clauseDesp = '';
  let clauseFat = '';
  if (filtros.inicio) {
    params.push(filtros.inicio);
    clauseDesp += ` AND pago_em >= date_trunc('month',$${params.length}::date)`;
    clauseFat  += ` AND paga_em >= date_trunc('month',$${params.length}::date)`;
  }
  if (filtros.fim) {
    params.push(filtros.fim);
    clauseDesp += ` AND pago_em <= date_trunc('month',$${params.length}::date)`;
    clauseFat  += ` AND paga_em <= date_trunc('month',$${params.length}::date)`;
  }
  if (!filtros.inicio && !filtros.fim) {
    clauseDesp = " AND pago_em >= date_trunc('month', now() - interval '12 months')";
    clauseFat  = " AND paga_em >= date_trunc('month', now() - interval '12 months')";
  }

  // Escopo aplicado nas despesas
  let escopoClauseDesp = '';
  const esc = filtros.escopo || 'oficina';
  if (esc === 'oficina' || esc === 'pessoal') {
    params.push(esc);
    escopoClauseDesp = ` AND escopo = $${params.length}`;
  }
  // Receita vem só de OS pagas — não faz sentido pra escopo='pessoal'
  const incluiReceita = (esc === 'oficina' || esc === 'ambos');

  const { rows } = await db.query(
    `WITH receita AS (
       SELECT date_trunc('month', paga_em)::date AS mes,
              ${incluiReceita ? 'sum(valor_total)::numeric' : '0::numeric'} AS receita,
              ${incluiReceita ? 'count(*)::int' : '0'} AS qtd_os
         FROM vw_faturamento
        WHERE ${incluiReceita ? '1=1' : '1=0'} ${clauseFat}
        GROUP BY 1
     ),
     despesa AS (
       SELECT date_trunc('month', pago_em)::date AS mes,
              sum(COALESCE(valor_pago, valor))::numeric AS despesa,
              count(*)::int AS qtd_despesas
         FROM despesas
        WHERE status='paga' AND pago_em IS NOT NULL
              ${escopoClauseDesp} ${clauseDesp}
        GROUP BY 1
     )
     SELECT COALESCE(r.mes, d.mes)      AS mes,
            COALESCE(r.receita, 0)      AS receita,
            COALESCE(d.despesa, 0)      AS despesa,
            COALESCE(r.receita, 0) - COALESCE(d.despesa, 0) AS lucro,
            COALESCE(r.qtd_os, 0)       AS qtd_os,
            COALESCE(d.qtd_despesas, 0) AS qtd_despesas
       FROM receita r FULL OUTER JOIN despesa d ON d.mes = r.mes
      ORDER BY 1`,
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

/**
 * OSs PAGAS em um dia específico — pra o dono conferir o que fechou
 * financeiramente naquele dia (data = paga_em).
 * Retorna dados suficientes pra renderizar tabela + total no rodapé.
 */
async function osDoDia({ data }) {
  const dia = data || new Date().toISOString().slice(0, 10);
  const { rows } = await db.query(
    `SELECT o.id, o.numero_os, o.valor_total, o.valor_pago,
            o.forma_pagamento, o.paga_em, o.aberta_em,
            c.nome AS cliente_nome,
            ca.placa, ca.marca, ca.modelo
       FROM ordens_servico o
       JOIN clientes c ON c.id = o.cliente_id
       JOIN carros  ca ON ca.id = o.carro_id
      WHERE o.status = 'paga'
        AND o.paga_em::date = $1::date
      ORDER BY o.paga_em ASC`,
    [dia],
  );
  const dados = rows.map((r) => ({
    ...r,
    valor_total: Number(r.valor_total),
    valor_pago: r.valor_pago == null ? null : Number(r.valor_pago),
  }));
  const total = dados.reduce((s, d) => s + (d.valor_pago ?? d.valor_total), 0);
  return {
    dia,
    dados,
    totais: {
      qtd: dados.length,
      recebido: Number(total.toFixed(2)),
    },
  };
}

/**
 * Todas as OSs pagas em um mês específico. Retorna a lista completa
 * (sem paginação) + agrupamento por dia + totais.
 */
async function osDoMes({ ano, mes }) {
  const y = Number(ano) || new Date().getFullYear();
  const m = Number(mes) || (new Date().getMonth() + 1);
  const inicio = `${y}-${String(m).padStart(2, '0')}-01`;
  const proxMes = m === 12 ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const { rows } = await db.query(
    `SELECT o.id, o.numero_os, o.valor_total, o.valor_pago,
            o.forma_pagamento, o.paga_em, o.aberta_em,
            o.paga_em::date AS dia,
            c.nome AS cliente_nome,
            ca.placa, ca.marca, ca.modelo
       FROM ordens_servico o
       JOIN clientes c ON c.id = o.cliente_id
       JOIN carros  ca ON ca.id = o.carro_id
      WHERE o.status = 'paga'
        AND o.paga_em >= $1::date AND o.paga_em < $2::date
      ORDER BY o.paga_em ASC`,
    [inicio, proxMes],
  );

  const dados = rows.map((r) => ({
    ...r,
    valor_total: Number(r.valor_total),
    valor_pago: r.valor_pago == null ? null : Number(r.valor_pago),
  }));

  // Agrupa por dia pra facilitar renderização
  const porDia = {};
  for (const os of dados) {
    const chave = String(os.dia).slice(0, 10);
    if (!porDia[chave]) porDia[chave] = { dia: chave, oss: [], total: 0 };
    porDia[chave].oss.push(os);
    porDia[chave].total += os.valor_pago ?? os.valor_total;
  }
  const dias = Object.values(porDia).sort((a, b) => a.dia.localeCompare(b.dia));

  const total = dados.reduce((s, o) => s + (o.valor_pago ?? o.valor_total), 0);
  return {
    ano: y, mes: m,
    dados, dias,
    totais: { qtd: dados.length, recebido: Number(total.toFixed(2)) },
  };
}

module.exports = {
  resumo, porCategoria, porFormaPagamento, porFornecedor,
  evolucaoMensal, fluxoCaixa, painelFinanceiro, osDoDia, osDoMes,
};
