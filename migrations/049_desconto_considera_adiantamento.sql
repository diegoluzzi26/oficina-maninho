-- =====================================================================
-- 049_desconto_considera_adiantamento.sql
--
-- `desconto_dado` era valor_total - valor_pago, mas valor_pago guarda só
-- o que entrou no fechamento: os adiantamentos ficam em os_adiantamentos.
-- Resultado: todo adiantamento aparecia como desconto concedido no Painel
-- e no DRE. Agora o desconto é o que sobra depois de pagamento E sinais.
--
-- Só muda a expressão de desconto_dado (CREATE OR REPLACE, sem recriar a
-- vw_fluxo_mensal, que depende desta view). valor_total/valor_pago seguem
-- como o recebido no fechamento, senão o fluxo de caixa contaria em dobro.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    IF to_regclass(format('%I.vw_faturamento', s)) IS NOT NULL
       AND to_regclass(format('%I.os_adiantamentos', s)) IS NOT NULL THEN
      EXECUTE format($view$
        CREATE OR REPLACE VIEW %1$I.vw_faturamento AS
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
            COALESCE(o.valor_pago, o.valor_total)::numeric  AS valor_total,
            o.valor_total                                   AS valor_cobrado,
            COALESCE(o.valor_pago, o.valor_total)::numeric  AS valor_pago,
            GREATEST(
              o.valor_total - COALESCE(o.valor_pago, o.valor_total) - COALESCE(a.total, 0),
              0::numeric
            )                                               AS desconto_dado,
            date_trunc('week',  o.paga_em)                  AS semana,
            date_trunc('month', o.paga_em)                  AS mes
        FROM %1$I.ordens_servico o
        JOIN %1$I.clientes c ON c.id = o.cliente_id
        JOIN %1$I.carros ca  ON ca.id = o.carro_id
        LEFT JOIN (
          SELECT os_id, sum(valor) AS total
            FROM %1$I.os_adiantamentos
           GROUP BY os_id
        ) a ON a.os_id = o.id
        WHERE o.status = 'paga' AND o.paga_em IS NOT NULL
      $view$, s);
    END IF;
  END LOOP;
END$$;

-- =====================================================================
-- ROLLBACK (rodar manualmente): repetir o bloco acima sem o LEFT JOIN e com
--
--   GREATEST(o.valor_total - COALESCE(o.valor_pago, o.valor_total), 0::numeric)
--     AS desconto_dado,
--
-- DELETE FROM _migrations WHERE nome = '049_desconto_considera_adiantamento.sql';
-- =====================================================================
