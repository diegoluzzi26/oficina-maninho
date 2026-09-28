-- =====================================================================
-- 030_etapa_regras.sql — Automações por etapa (gatilho → ação)
--
-- Cada etapa do Kanban pode ter regras "ao entrar aqui, faça X". Isso
-- automatiza tarefas repetitivas da oficina sem depender de ninguém
-- lembrar. Ações desta v1:
--   - criar_retorno       → agenda um retorno/lembrete pra OS
--   - enfileirar_followup → cria um follow-up na fila em 'pendente'
--
-- REGRA DO PROJETO: nada de WhatsApp automático. Nenhuma ação envia
-- mensagem sozinha — o follow-up entra como 'pendente' e só sai com o
-- opt-in manual de sempre.
--
-- Tenancy schema-por-oficina (026): tabela criada em cada oficina_<slug>.
-- Reversível: DROP TABLE %I.etapa_regras por schema (bloco no fim).
-- =====================================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'etapas_kanban'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'etapa_regras'
    ) THEN
      EXECUTE format(
        'CREATE TABLE %1$I.etapa_regras (
           id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           etapa_id  UUID NOT NULL REFERENCES %1$I.etapas_kanban(id) ON DELETE CASCADE,
           gatilho   TEXT NOT NULL DEFAULT ''ao_entrar'',
           acao      TEXT NOT NULL CHECK (acao IN (''criar_retorno'', ''enfileirar_followup'')),
           params    JSONB NOT NULL DEFAULT ''{}''::jsonb,
           ativo     BOOLEAN NOT NULL DEFAULT true,
           criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
         )', s
      );
      EXECUTE format(
        'CREATE INDEX idx_etapa_regras_etapa ON %I.etapa_regras (etapa_id)', s
      );
      EXECUTE format(
        'COMMENT ON TABLE %I.etapa_regras IS %L', s,
        'Automações por etapa do Kanban (ao entrar → ação). Nunca envia WhatsApp sozinho.'
      );
    END IF;
  END LOOP;
END$$;

-- =====================================================================
-- ROLLBACK (manual):
--
-- DO $$
-- DECLARE s TEXT;
-- BEGIN
--   FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
--   LOOP
--     IF EXISTS (SELECT 1 FROM information_schema.tables
--                 WHERE table_schema = s AND table_name = 'etapa_regras') THEN
--       EXECUTE format('DROP TABLE %I.etapa_regras', s);
--     END IF;
--   END LOOP;
-- END$$;
-- DELETE FROM _migrations WHERE nome = '030_etapa_regras.sql';
-- =====================================================================
