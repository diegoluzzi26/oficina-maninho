-- =====================================================================
-- 009_despesa_escopo.sql — Separação oficina × pessoal
--
-- 'oficina'  → tudo relacionado à empresa (aluguel, água, peças
--              compradas de fornecedor, salário de funcionário…).
--              Aparece na aba Despesas e no painel financeiro da oficina.
-- 'pessoal'  → gastos do dono não relacionados à oficina. Só aparecem
--              na aba nova "Despesas pessoais", com painel próprio.
--
-- Nunca cruzam — o painel da oficina IGNORA escopo='pessoal' e vice-versa.
-- Padrão = 'oficina' (mantém comportamento existente sem migration de
-- dados).
-- =====================================================================

CREATE TYPE despesa_escopo AS ENUM ('oficina', 'pessoal');

ALTER TABLE despesas
    ADD COLUMN escopo despesa_escopo NOT NULL DEFAULT 'oficina';

CREATE INDEX idx_despesas_escopo ON despesas (escopo);

-- View vw_despesas já existe; recria pra expor o escopo
DROP VIEW IF EXISTS vw_despesas;
CREATE VIEW vw_despesas AS
SELECT d.*,
       f.nome AS fornecedor_nome,
       cd.nome AS categoria_nome,
       cd.cor  AS categoria_cor,
       CASE
         WHEN d.status = 'paga' THEN NULL
         WHEN d.vencimento IS NULL THEN NULL
         ELSE (d.vencimento - CURRENT_DATE)::int
       END AS dias_para_vencer
  FROM despesas d
  LEFT JOIN fornecedores f       ON f.id = d.fornecedor_id
  LEFT JOIN categorias_despesa cd ON cd.id = d.categoria_id;

-- Ajuste no fluxo mensal pra separar oficina de pessoal.
-- Painel da oficina lê 'oficina'; painel pessoal lê 'pessoal'.
DROP VIEW IF EXISTS vw_fluxo_mensal;
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
     WHERE status = 'paga' AND pago_em IS NOT NULL AND escopo = 'oficina'
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
