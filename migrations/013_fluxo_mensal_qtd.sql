-- =====================================================================
-- 013_fluxo_mensal_qtd.sql
--
-- Regressão introduzida na 008/009: recriei vw_fluxo_mensal só com
-- (mes, receita, despesa, lucro) e perdi as colunas qtd_os e
-- qtd_despesas que o financeiro.service usa. Recria com elas de volta.
-- =====================================================================

DROP VIEW IF EXISTS vw_fluxo_mensal;

CREATE VIEW vw_fluxo_mensal AS
WITH receita AS (
    SELECT date_trunc('month', paga_em)::date AS mes,
           sum(valor_total)::numeric AS receita,
           count(*)::int             AS qtd_os
      FROM vw_faturamento
     GROUP BY 1
),
despesa AS (
    SELECT date_trunc('month', pago_em)::date AS mes,
           sum(COALESCE(valor_pago, valor))::numeric AS despesa,
           count(*)::int AS qtd_despesas
      FROM despesas
     WHERE status = 'paga' AND pago_em IS NOT NULL AND escopo = 'oficina'
     GROUP BY 1
)
SELECT
    COALESCE(r.mes, d.mes)                          AS mes,
    COALESCE(r.receita, 0)                          AS receita,
    COALESCE(d.despesa, 0)                          AS despesa,
    COALESCE(r.receita, 0) - COALESCE(d.despesa, 0) AS lucro,
    COALESCE(r.qtd_os, 0)                           AS qtd_os,
    COALESCE(d.qtd_despesas, 0)                     AS qtd_despesas
FROM receita r
FULL OUTER JOIN despesa d ON d.mes = r.mes
ORDER BY 1;
