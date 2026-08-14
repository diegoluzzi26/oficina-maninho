-- =====================================================================
-- 025_os_pagamentos.sql
--
-- Permite que uma OS seja quitada com múltiplas formas de pagamento
-- (ex: R$ 100 no PIX + R$ 50 em dinheiro) e mantém histórico de
-- pagamentos parciais no tempo.
--
-- Antes: cada OS tinha um único forma_pagamento + valor_pago.
-- Depois: N linhas em os_pagamentos; forma_pagamento e valor_pago da
-- OS passam a ser cache do "primeiro" pagamento e do total pago
-- respectivamente. Views antigas continuam funcionando.
-- =====================================================================

CREATE TABLE os_pagamentos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id      UUID           NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    forma      forma_pagamento NOT NULL,
    valor      NUMERIC(12,2)  NOT NULL CHECK (valor > 0),
    pago_em    TIMESTAMPTZ    NOT NULL DEFAULT now(),
    observacao TEXT,
    criado_em  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_pag_os      ON os_pagamentos (os_id);
CREATE INDEX idx_os_pag_pago_em ON os_pagamentos (pago_em);
CREATE INDEX idx_os_pag_forma   ON os_pagamentos (forma);

-- Backfill: cada OS já paga vira uma linha em os_pagamentos preservando
-- forma e data originais. Sem isso o fluxo diário/semanal ficaria zerado
-- pra tudo antes desta migration.
INSERT INTO os_pagamentos (os_id, forma, valor, pago_em)
SELECT id,
       COALESCE(forma_pagamento, 'dinheiro'::forma_pagamento),
       COALESCE(valor_pago, valor_total),
       COALESCE(paga_em, criado_em)
  FROM ordens_servico
 WHERE status = 'paga'
   AND COALESCE(valor_pago, valor_total) > 0;

-- Sincroniza cache na OS: valor_pago = soma dos pagamentos,
-- forma_pagamento = a mais antiga (só pra manter compat com relatórios
-- que ainda filtram pela coluna). Quando há mais de uma forma, a UI
-- mostra "Múltiplo" consultando os_pagamentos direto.
CREATE OR REPLACE FUNCTION trg_sync_os_pagamento() RETURNS TRIGGER AS $$
DECLARE
    v_os_id UUID := COALESCE(NEW.os_id, OLD.os_id);
    v_total NUMERIC(12,2);
    v_primeira forma_pagamento;
BEGIN
    SELECT COALESCE(SUM(valor), 0),
           (SELECT forma FROM os_pagamentos WHERE os_id = v_os_id ORDER BY pago_em, criado_em LIMIT 1)
      INTO v_total, v_primeira
      FROM os_pagamentos
     WHERE os_id = v_os_id;

    UPDATE ordens_servico
       SET valor_pago      = NULLIF(v_total, 0),
           forma_pagamento = v_primeira
     WHERE id = v_os_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_os_pag_sync
AFTER INSERT OR UPDATE OR DELETE ON os_pagamentos
FOR EACH ROW EXECUTE FUNCTION trg_sync_os_pagamento();

-- ---------------------------------------------------------------------
-- View: entradas do caixa por dia — agora vem de os_pagamentos e não
-- mais de ordens_servico.paga_em. Isso permite que dois pagamentos da
-- mesma OS caiam em dias diferentes (ex: entrada + retirada).
-- ---------------------------------------------------------------------
CREATE VIEW vw_entradas_diarias AS
SELECT date_trunc('day', p.pago_em)::date AS dia,
       p.forma,
       SUM(p.valor)::numeric               AS total,
       COUNT(*)::int                       AS qtd
  FROM os_pagamentos p
 GROUP BY 1, 2;

CREATE VIEW vw_saidas_diarias AS
SELECT pago_em::date                       AS dia,
       forma,
       SUM(COALESCE(valor_pago, valor))::numeric AS total,
       COUNT(*)::int                       AS qtd
  FROM despesas
 WHERE status = 'paga' AND pago_em IS NOT NULL
 GROUP BY 1, 2;

-- Fluxo diário consolidado (entrada, saída, líquido) — sem quebrar por
-- forma. Usado no dashboard e nos cards de "hoje" / "esta semana".
CREATE VIEW vw_fluxo_diario AS
WITH e AS (
    SELECT dia, SUM(total)::numeric AS entrada
      FROM vw_entradas_diarias GROUP BY 1
), s AS (
    SELECT dia, SUM(total)::numeric AS saida
      FROM vw_saidas_diarias GROUP BY 1
)
SELECT COALESCE(e.dia, s.dia)               AS dia,
       COALESCE(e.entrada, 0)::numeric      AS entrada,
       COALESCE(s.saida, 0)::numeric        AS saida,
       (COALESCE(e.entrada, 0) - COALESCE(s.saida, 0))::numeric AS liquido
  FROM e FULL OUTER JOIN s USING (dia);

-- Semana ISO (segunda a domingo) — mesmo critério do date_trunc('week').
CREATE VIEW vw_fluxo_semanal AS
WITH e AS (
    SELECT date_trunc('week', dia)::date AS semana,
           SUM(entrada)::numeric         AS entrada
      FROM vw_fluxo_diario GROUP BY 1
), s AS (
    SELECT date_trunc('week', dia)::date AS semana,
           SUM(saida)::numeric           AS saida
      FROM vw_fluxo_diario GROUP BY 1
)
SELECT COALESCE(e.semana, s.semana)         AS semana,
       COALESCE(e.entrada, 0)::numeric      AS entrada,
       COALESCE(s.saida, 0)::numeric        AS saida,
       (COALESCE(e.entrada, 0) - COALESCE(s.saida, 0))::numeric AS liquido
  FROM e FULL OUTER JOIN s USING (semana);
