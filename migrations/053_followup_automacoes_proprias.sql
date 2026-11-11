-- =====================================================================
-- 053_followup_automacoes_proprias.sql — Automações criadas pela oficina
--
-- Além dos quatro cartões fixos (regras com `chave`), a oficina cria as
-- próprias automações (regras sem chave, com `gatilho`):
--   servico_feito — N dias depois de uma OS paga/finalizada que teve um
--                   dos serviços/peças escolhidos (filtros.servico_ids,
--                   filtros.peca_ids)
--   sumido        — cliente há N dias sem abrir OS (uma vez por sumiço)
--   aniversario   — no dia do aniversário do cliente (clientes.data_nascimento)
--   campanha      — sob demanda, para um público filtrado (marca, modelo,
--                   serviço já feito, última visita)
--
-- `envio_automatico`: os itens dessa automação saem sozinhos pelo WhatsApp
-- (geração das 8h; na campanha, assim que ela é montada). Desligado = cai
-- em Para enviar para revisão, como sempre foi.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

DO $$
DECLARE s TEXT;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    CONTINUE WHEN to_regclass(format('%I.followup_regras', s)) IS NULL;

    EXECUTE format(
      'ALTER TABLE %I.followup_regras ADD COLUMN IF NOT EXISTS gatilho TEXT
         CHECK (gatilho IN (''servico_feito'', ''sumido'', ''aniversario'', ''campanha''))', s);
    EXECUTE format(
      'ALTER TABLE %I.followup_regras ADD COLUMN IF NOT EXISTS filtros JSONB NOT NULL DEFAULT ''{}''::jsonb', s);
    EXECUTE format(
      'ALTER TABLE %I.followup_regras ADD COLUMN IF NOT EXISTS envio_automatico BOOLEAN NOT NULL DEFAULT FALSE', s);

    EXECUTE format('ALTER TABLE %I.clientes ADD COLUMN IF NOT EXISTS data_nascimento DATE', s);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- DOWN (rodar manualmente para reverter)
-- ---------------------------------------------------------------------
-- DO $$
-- DECLARE s TEXT;
-- BEGIN
--   FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
--   LOOP
--     CONTINUE WHEN to_regclass(format('%I.followup_regras', s)) IS NULL;
--     -- Automações próprias deixam de existir; o histórico da fila fica (regra_id vira NULL).
--     EXECUTE format('DELETE FROM %I.followup_regras WHERE chave IS NULL AND gatilho IS NOT NULL', s);
--     EXECUTE format('ALTER TABLE %I.followup_regras DROP COLUMN IF EXISTS gatilho', s);
--     EXECUTE format('ALTER TABLE %I.followup_regras DROP COLUMN IF EXISTS filtros', s);
--     EXECUTE format('ALTER TABLE %I.followup_regras DROP COLUMN IF EXISTS envio_automatico', s);
--     EXECUTE format('ALTER TABLE %I.clientes DROP COLUMN IF EXISTS data_nascimento', s);
--   END LOOP;
-- END $$;
-- DELETE FROM _migrations WHERE nome = '053_followup_automacoes_proprias.sql';
