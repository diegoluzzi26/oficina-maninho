-- =====================================================================
-- 048_etapa_orcamento_negado.sql — Coluna "Orçamento negado" no Kanban
--
-- Cria, em cada oficina, a etapa ligada ao status 'negada', no fim do
-- quadro. Não duplica se a oficina já tiver etapa ativa com esse status.
--
-- Reversível: bloco comentado no fim (devolve as OS negadas para 'aberta'
-- e remove a etapa).
-- =====================================================================

DO $$
DECLARE
  s TEXT;
  existe BOOLEAN;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'etapas_kanban'
    ) THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.etapas_kanban
                         WHERE ativo AND status_ao_entrar = %L)', s, 'negada'
      ) INTO existe;

      IF NOT existe THEN
        EXECUTE format(
          'INSERT INTO %1$I.etapas_kanban (nome, cor, ordem, status_ao_entrar)
           SELECT %2$L, %3$L, COALESCE(MAX(ordem), 0) + 1, %4$L
             FROM %1$I.etapas_kanban', s,
          'Orçamento negado', '#f43f5e', 'negada'  -- rose-500
        );
      END IF;
    END IF;
  END LOOP;
END$$;

-- =====================================================================
-- ROLLBACK (rodar manualmente, antes do rollback da 047):
--
-- DO $$
-- DECLARE s TEXT;
-- BEGIN
--   FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
--   LOOP
--     IF EXISTS (SELECT 1 FROM information_schema.tables
--                 WHERE table_schema = s AND table_name = 'etapas_kanban') THEN
--       EXECUTE format(
--         'UPDATE %1$I.ordens_servico o
--             SET status = %2$L,
--                 etapa_id = (SELECT id FROM %1$I.etapas_kanban
--                              WHERE ativo AND status_ao_entrar = %2$L
--                              ORDER BY ordem, criado_em LIMIT 1)
--           WHERE o.status = %3$L', s, 'aberta', 'negada');
--       EXECUTE format('DELETE FROM %I.etapas_kanban WHERE status_ao_entrar = %L', s, 'negada');
--     END IF;
--   END LOOP;
-- END$$;
-- DELETE FROM _migrations WHERE nome = '048_etapa_orcamento_negado.sql';
-- =====================================================================
