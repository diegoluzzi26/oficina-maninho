'use strict';
const db = require('../config/db');
const config = require('./config.service');

/**
 * Todos os relatórios usam vw_faturamento, que considera apenas OS com
 * status 'paga', datada por paga_em. Receita entra quando o dinheiro entra.
 */

function intervalo({ inicio, fim }) {
  // Sem filtro: últimos 12 meses.
  const params = [];
  let clause = '';
  if (inicio) { params.push(inicio); clause += ` AND paga_em >= $${params.length}::date`; }
  if (fim)    { params.push(fim);    clause += ` AND paga_em < ($${params.length}::date + interval '1 day')`; }
  if (!inicio && !fim) clause = " AND paga_em >= now() - interval '12 months'";
  return { clause, params };
}

async function faturamentoPorPeriodo(filtros, granularidade = 'month') {
  const trunc = granularidade === 'week' ? 'week' : 'month';
  const { clause, params } = intervalo(filtros);

  const { rows } = await db.query(
    `SELECT date_trunc('${trunc}', paga_em)      AS periodo,
            count(*)::int                        AS qtd_os,
            COALESCE(sum(valor_total), 0)::numeric AS faturamento,
            COALESCE(avg(valor_total), 0)::numeric AS ticket_medio
       FROM vw_faturamento
      WHERE 1=1 ${clause}
      GROUP BY 1 ORDER BY 1`,
    params,
  );
  return rows.map((r) => ({
    periodo: r.periodo,
    qtd_os: r.qtd_os,
    faturamento: Number(r.faturamento),
    ticket_medio: Number(Number(r.ticket_medio).toFixed(2)),
  }));
}

async function resumo(filtros) {
  const { clause, params } = intervalo(filtros);
  const { rows } = await db.query(
    `SELECT count(*)::int                          AS qtd_os,
            COALESCE(sum(valor_total),0)::numeric   AS faturamento,
            COALESCE(avg(valor_total),0)::numeric   AS ticket_medio,
            count(DISTINCT cliente_id)::int         AS clientes_atendidos
       FROM vw_faturamento WHERE 1=1 ${clause}`,
    params,
  );
  const r = rows[0];

  // OS em aberto não entram no faturamento, mas o dono quer ver o que está na fila
  const pipeline = await db.query(
    `SELECT status, count(*)::int AS qtd, COALESCE(sum(valor_total),0)::numeric AS valor
       FROM ordens_servico WHERE status <> 'paga' GROUP BY status`,
  );

  return {
    qtd_os: r.qtd_os,
    faturamento: Number(r.faturamento),
    ticket_medio: Number(Number(r.ticket_medio).toFixed(2)),
    clientes_atendidos: r.clientes_atendidos,
    em_aberto: pipeline.rows.map((p) => ({
      status: p.status, qtd: p.qtd, valor: Number(p.valor),
    })),
  };
}

/** Ranking de serviços por quantidade e por receita. */
async function servicosMaisVendidos(filtros) {
  const { clause, params } = intervalo(filtros);
  params.push(filtros.limite || 10);

  const { rows } = await db.query(
    `SELECT i.nome_servico,
            SUM(i.quantidade)::int              AS quantidade,
            COALESCE(SUM(i.valor_total),0)::numeric AS receita
       FROM os_servicos i
       JOIN vw_faturamento f ON f.os_id = i.os_id
      WHERE 1=1 ${clause}
      GROUP BY i.nome_servico
      ORDER BY receita DESC, quantidade DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    nome_servico: r.nome_servico,
    quantidade: r.quantidade,
    receita: Number(r.receita),
  }));
}

/** Clientes com mais OS no período — base para ação de fidelização. */
async function clientesRecorrentes(filtros) {
  const { clause, params } = intervalo(filtros);
  params.push(filtros.limite || 10);

  const { rows } = await db.query(
    `SELECT f.cliente_id, f.cliente_nome, c.numero_cliente, c.telefone,
            count(*)::int                          AS qtd_os,
            COALESCE(sum(f.valor_total),0)::numeric AS total_gasto,
            max(f.paga_em)                          AS ultima_visita
       FROM vw_faturamento f
       JOIN clientes c ON c.id = f.cliente_id
      WHERE 1=1 ${clause}
      GROUP BY f.cliente_id, f.cliente_nome, c.numero_cliente, c.telefone
     HAVING count(*) > 1
      ORDER BY qtd_os DESC, total_gasto DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({ ...r, total_gasto: Number(r.total_gasto) }));
}

/** Mês atual vs anterior, para o card de comparativo do dashboard. */
async function comparativoMensal() {
  const { rows } = await db.query(
    `WITH meses AS (
       SELECT date_trunc('month', paga_em) AS mes,
              sum(valor_total)::numeric    AS faturamento,
              count(*)::int                AS qtd_os
         FROM vw_faturamento
        WHERE paga_em >= date_trunc('month', now()) - interval '1 month'
        GROUP BY 1
     )
     SELECT
       COALESCE((SELECT faturamento FROM meses WHERE mes = date_trunc('month', now())), 0) AS mes_atual,
       COALESCE((SELECT faturamento FROM meses WHERE mes = date_trunc('month', now()) - interval '1 month'), 0) AS mes_anterior,
       COALESCE((SELECT qtd_os FROM meses WHERE mes = date_trunc('month', now())), 0) AS qtd_atual,
       COALESCE((SELECT qtd_os FROM meses WHERE mes = date_trunc('month', now()) - interval '1 month'), 0) AS qtd_anterior`,
  );
  const r = rows[0];
  const atual = Number(r.mes_atual);
  const anterior = Number(r.mes_anterior);

  return {
    mes_atual: atual,
    mes_anterior: anterior,
    qtd_atual: r.qtd_atual,
    qtd_anterior: r.qtd_anterior,
    // Sem base de comparação, variação percentual não existe (evita divisão por zero)
    variacao_percentual: anterior > 0
      ? Number((((atual - anterior) / anterior) * 100).toFixed(2))
      : null,
  };
}

/**
 * Painel do mês: tudo relativo a um mês específico (default = mês atual).
 * Combina receita, despesa paga no mês, lucro, ticket, e OS em aberto.
 * Feito num único endpoint pra o dashboard não fazer 5 chamadas.
 */
async function painelMes({ ano, mes } = {}) {
  const hoje = new Date();
  const y = Number(ano) || hoje.getUTCFullYear();
  const m = Number(mes) || hoje.getUTCMonth() + 1;

  // Primeiro e último dia do mês. Uso strings pra não perder por UTC.
  const inicio = `${y}-${String(m).padStart(2, '0')}-01`;
  const proxMes = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const [fatQ, despQ, pipelineQ, formaQ, servicosQ, comparativoQ] = await Promise.all([
    db.query(
      `SELECT COALESCE(sum(valor_total),0)::numeric AS receita,
              count(*)::int AS qtd_os,
              COALESCE(avg(valor_total),0)::numeric AS ticket_medio,
              count(DISTINCT cliente_id)::int AS clientes
         FROM vw_faturamento
        WHERE paga_em >= $1::date AND paga_em < $2::date`, [inicio, proxMes],
    ),
    db.query(
      `SELECT COALESCE(sum(valor_pago), sum(valor))::numeric AS despesa
         FROM despesas
        WHERE status = 'paga' AND pago_em >= $1::date AND pago_em < $2::date`,
      [inicio, proxMes],
    ),
    db.query(
      `SELECT status, count(*)::int AS qtd, COALESCE(sum(valor_total),0)::numeric AS valor
         FROM ordens_servico WHERE status NOT IN ('paga')
        GROUP BY status`,
    ),
    db.query(
      `SELECT forma_pagamento AS forma, count(*)::int AS qtd,
              COALESCE(sum(valor_pago),0)::numeric AS total
         FROM ordens_servico
        WHERE status = 'paga' AND paga_em >= $1::date AND paga_em < $2::date
        GROUP BY forma_pagamento
        ORDER BY total DESC`, [inicio, proxMes],
    ),
    db.query(
      `SELECT i.nome_servico,
              SUM(i.quantidade)::int AS quantidade,
              COALESCE(SUM(i.valor_total),0)::numeric AS receita
         FROM os_servicos i
         JOIN vw_faturamento f ON f.os_id = i.os_id
        WHERE f.paga_em >= $1::date AND f.paga_em < $2::date
        GROUP BY i.nome_servico
        ORDER BY receita DESC
        LIMIT 5`, [inicio, proxMes],
    ),
    comparativoMensal(),
  ]);

  const receita = Number(fatQ.rows[0].receita);
  const despesa = Number(despQ.rows[0].despesa || 0);

  // Projeção linear: extrapola o ritmo atual pro fechamento do mês.
  // Só faz sentido pro mês corrente — pra meses passados, projeção = receita.
  const eMesAtual = y === hoje.getUTCFullYear() && m === hoje.getUTCMonth() + 1;
  const diasNoMes = new Date(y, m, 0).getDate();
  const diaAtual = eMesAtual ? hoje.getDate() : diasNoMes;
  const projecao = eMesAtual && diaAtual > 0
    ? Number(((receita / diaAtual) * diasNoMes).toFixed(2))
    : receita;
  const diasRestantes = eMesAtual ? diasNoMes - diaAtual : 0;

  const metaMensal = config.meta().mensal;

  return {
    referencia: { ano: y, mes: m, inicio, fim: proxMes },
    receita,
    despesa,
    lucro: Number((receita - despesa).toFixed(2)),
    meta: metaMensal,
    projecao_fechamento: projecao,
    dias_restantes: diasRestantes,
    qtd_os: fatQ.rows[0].qtd_os,
    ticket_medio: Number(Number(fatQ.rows[0].ticket_medio).toFixed(2)),
    clientes_atendidos: fatQ.rows[0].clientes,
    em_aberto: pipelineQ.rows.map((p) => ({
      status: p.status, qtd: p.qtd, valor: Number(p.valor),
    })),
    por_forma: formaQ.rows.map((r) => ({
      forma: r.forma, qtd: r.qtd, total: Number(r.total),
    })),
    top_servicos: servicosQ.rows.map((r) => ({
      nome_servico: r.nome_servico,
      quantidade: r.quantidade,
      receita: Number(r.receita),
    })),
    comparativo: comparativoQ,
  };
}

module.exports = {
  resumo, faturamentoPorPeriodo, servicosMaisVendidos,
  clientesRecorrentes, comparativoMensal, painelMes,
};
