-- =====================================================================
-- 008_faturamento_valor_pago.sql
--
-- Muda a régua do faturamento: em vez de contar `valor_total` da OS
-- (o que foi cobrado no papel), conta `valor_pago` (o que realmente
-- entrou no caixa). A diferença (`valor_total - valor_pago`) é o
-- "desconto dado" — que o dashboard vai passar a mostrar por mês.
-- =====================================================================

DROP VIEW IF EXISTS vw_fluxo_mensal;
DROP VIEW IF EXISTS vw_faturamento;

CREATE VIEW vw_faturamento AS
SELECT
    o.id                                            AS os_id,
    o.numero_os,
    o.cliente_id,
    c.nome                                          AS cliente_nome,
    o.carro_id,
    ca.placa,
    ca.marca,
    ca.modelo,
    o.aberta_em,
    o.fechada_em,
    o.paga_em,
    o.forma_pagamento,
    -- 'valor_total' aqui continua nomeado assim pra não quebrar
    -- consumidores antigos, mas passa a refletir o valor_pago
    -- (o dinheiro que efetivamente entrou no caixa).
    COALESCE(o.valor_pago, o.valor_total)::numeric  AS valor_total,
    o.valor_total                                   AS valor_cobrado,
    COALESCE(o.valor_pago, o.valor_total)::numeric  AS valor_pago,
    GREATEST(o.valor_total - COALESCE(o.valor_pago, o.valor_total), 0)::numeric AS desconto_dado,
    date_trunc('week',  o.paga_em)                  AS semana,
    date_trunc('month', o.paga_em)                  AS mes
FROM ordens_servico o
JOIN clientes c ON c.id = o.cliente_id
JOIN carros ca  ON ca.id = o.carro_id
WHERE o.status = 'paga' AND o.paga_em IS NOT NULL;

CREATE VIEW vw_fluxo_mensal AS
WITH receita AS (
    SELECT date_trunc('month', paga_em)::date AS mes,
           sum(valor_total)::numeric AS receita
      FROM vw_faturamento
     GROUP BY 1
),
despesa AS (
    SELECT date_trunc('month', pago_em)::date AS mes,
           sum(COALESCE(valor_pago, valor))::numeric AS despesa
      FROM despesas
     WHERE status = 'paga' AND pago_em IS NOT NULL
     GROUP BY 1
)
SELECT
    COALESCE(r.mes, d.mes) AS mes,
    COALESCE(r.receita, 0) AS receita,
    COALESCE(d.despesa, 0) AS despesa,
    COALESCE(r.receita, 0) - COALESCE(d.despesa, 0) AS lucro
FROM receita r
FULL OUTER JOIN despesa d ON d.mes = r.mes
ORDER BY 1;
