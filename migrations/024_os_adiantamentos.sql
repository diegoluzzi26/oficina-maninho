-- =====================================================================
-- 024_os_adiantamentos.sql — Sinal/adiantamento do cliente na OS
--
-- Cliente pode pagar uma parte da OS antes de finalizar (ex: sinal
-- de R$ 200 pra a oficina comprar peça, resto quando pega o carro).
-- Antes, esse dinheiro só entrava no faturamento quando a OS virava
-- 'paga'. Agora entra no fluxo de caixa na DATA que foi recebido.
--
-- Modelo:
--   - Tabela `os_adiantamentos` guarda cada sinal (valor + forma + data).
--   - No fechamento da OS: o trigger existente que preenchia valor_pago
--     com valor_total foi ajustado — passa a preencher com
--     (valor_total - soma dos adiantamentos), o "restante devido".
--     Assim não conta em dobro.
--   - vw_fluxo_mensal soma: receita_fechamento (valor_pago das OS pagas)
--     + receita_adiantamento (adiantamentos por recebido_em).
-- =====================================================================

CREATE TABLE os_adiantamentos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id         UUID           NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    valor         NUMERIC(10,2)  NOT NULL CHECK (valor > 0),
    forma         forma_pagamento NOT NULL,
    recebido_em   DATE           NOT NULL DEFAULT CURRENT_DATE,
    observacoes   TEXT,
    criado_por    UUID           REFERENCES users(id) ON DELETE SET NULL,
    criado_em     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_adiantamentos_os   ON os_adiantamentos (os_id);
CREATE INDEX idx_os_adiantamentos_data ON os_adiantamentos (recebido_em);

-- Substitui o trigger antigo pra descontar adiantamentos do fechamento
CREATE OR REPLACE FUNCTION trg_os_default_valor_pago() RETURNS TRIGGER AS $$
DECLARE
    total_adiantado NUMERIC;
BEGIN
    IF NEW.status = 'paga' AND OLD.status <> 'paga' AND NEW.valor_pago IS NULL THEN
        SELECT COALESCE(sum(valor), 0)::numeric INTO total_adiantado
          FROM os_adiantamentos WHERE os_id = NEW.id;
        NEW.valor_pago := GREATEST(NEW.valor_total - total_adiantado, 0);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- vw_fluxo_mensal precisa somar adiantamentos como receita
DROP VIEW IF EXISTS vw_fluxo_mensal;

CREATE VIEW vw_fluxo_mensal AS
WITH receita_fech AS (
    SELECT date_trunc('month', paga_em)::date AS mes,
           sum(valor_total)::numeric AS valor,
           count(*)::int             AS qtd_os
      FROM vw_faturamento
     GROUP BY 1
),
receita_adiant AS (
    SELECT date_trunc('month', recebido_em)::date AS mes,
           sum(valor)::numeric AS valor
      FROM os_adiantamentos
     GROUP BY 1
),
receita AS (
    SELECT COALESCE(f.mes, a.mes) AS mes,
           COALESCE(f.valor, 0) + COALESCE(a.valor, 0) AS receita,
           COALESCE(f.qtd_os, 0) AS qtd_os
      FROM receita_fech f
      FULL OUTER JOIN receita_adiant a ON a.mes = f.mes
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
