-- =====================================================================
-- 054_followup_excluidos.sql — Card excluído não volta na fila
--
-- Excluir um card apaga a linha de followup_fila. Só que "Atualizar fila"
-- (e a geração das 8h) decide quem já foi chamado olhando justamente essa
-- tabela: sem a linha, o mesmo cliente entrava de novo.
--
-- followup_excluidos guarda o que foi excluído (só o necessário para a
-- geração reconhecer: cliente, automação, OS e retorno de origem, e quando
-- o card tinha sido criado). A geração passa a consultar as duas tabelas,
-- com a mesma validade que já usa para a fila (ex.: reativação volta a
-- valer depois que o cliente visita a oficina de novo).
--
-- Apagar a automação apaga as marcas dela (ON DELETE CASCADE).
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

DO $$
DECLARE s TEXT;
BEGIN
  FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    CONTINUE WHEN to_regclass(format('%I.followup_fila', s)) IS NULL;

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %1$I.followup_excluidos (
         id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         cliente_id   UUID NOT NULL REFERENCES %1$I.clientes(id) ON DELETE CASCADE,
         regra_id     UUID REFERENCES %1$I.followup_regras(id) ON DELETE CASCADE,
         os_origem_id UUID REFERENCES %1$I.ordens_servico(id) ON DELETE CASCADE,
         retorno_id   UUID REFERENCES %1$I.retornos(id) ON DELETE CASCADE,
         tipo         TEXT NOT NULL,
         criado_em    TIMESTAMPTZ NOT NULL,
         excluido_em  TIMESTAMPTZ NOT NULL DEFAULT now()
       )', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_followup_excluidos_cliente ON %I.followup_excluidos (cliente_id)', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_followup_excluidos_os ON %I.followup_excluidos (os_origem_id)
         WHERE os_origem_id IS NOT NULL', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_followup_excluidos_retorno ON %I.followup_excluidos (retorno_id)
         WHERE retorno_id IS NOT NULL', s);
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
--     EXECUTE format('DROP TABLE IF EXISTS %I.followup_excluidos', s);
--   END LOOP;
-- END $$;
-- DELETE FROM _migrations WHERE nome = '054_followup_excluidos.sql';
