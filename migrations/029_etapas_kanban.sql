-- =====================================================================
-- 029_etapas_kanban.sql — Etapas customizáveis do Kanban de OS
--
-- Até agora o Kanban de ordens tinha colunas FIXAS coladas no status
-- financeiro (aberta/em_andamento/finalizada/paga). Agora cada oficina
-- pode ter suas próprias colunas ("Aguardando peça", "Em teste"...),
-- separando a ETAPA OPERACIONAL (livre) do STATUS FINANCEIRO (fixo, que
-- dirige caixa/relatórios).
--
-- Cada etapa pode, opcionalmente, apontar pra um status (status_ao_entrar):
-- arrastar a OS pra essa etapa dispara a transição de status (o backend
-- reaproveita a regra existente — ex.: 'paga' continua exigindo pagamento).
-- Etapas sem mapeamento só movem o card.
--
-- Tenancy é schema-por-oficina (desde a 026): a tabela é criada em cada
-- schema oficina_<slug> e o ENUM os_status mora no public (compartilhado).
-- Oficinas novas (Fase 2) clonam oficina_maninho, que já terá tudo pronto.
--
-- Seed: 4 etapas que reproduzem o quadro atual (mapeadas 1:1 ao status).
-- Backfill: cada OS recebe a etapa cujo status_ao_entrar == status atual.
--
-- Reversível: bloco comentado no fim (DROP das colunas + DROP TABLE por
-- schema oficina_*).
-- =====================================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    -- Só age em schemas que têm a OS e ainda não têm etapas_kanban.
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'ordens_servico'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'etapas_kanban'
    ) THEN
      -- 1) Tabela de etapas
      EXECUTE format(
        'CREATE TABLE %1$I.etapas_kanban (
           id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           nome             TEXT NOT NULL,
           cor              TEXT,
           ordem            INTEGER NOT NULL,
           status_ao_entrar public.os_status,
           ativo            BOOLEAN NOT NULL DEFAULT true,
           criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
           atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
         )', s
      );
      EXECUTE format(
        'CREATE TRIGGER t_etapas_kanban_upd BEFORE UPDATE ON %I.etapas_kanban
           FOR EACH ROW EXECUTE FUNCTION public.trg_set_atualizado_em()', s
      );
      EXECUTE format(
        'COMMENT ON TABLE %I.etapas_kanban IS %L', s,
        'Colunas do Kanban de OS, por oficina. status_ao_entrar (opcional) '
        || 'liga a etapa ao status financeiro da OS.'
      );

      -- 2) Colunas na OS: etapa atual + quando entrou nela (SLA / gatilhos)
      EXECUTE format(
        'ALTER TABLE %1$I.ordens_servico
           ADD COLUMN etapa_id UUID REFERENCES %1$I.etapas_kanban(id) ON DELETE SET NULL,
           ADD COLUMN etapa_entrou_em TIMESTAMPTZ NOT NULL DEFAULT now()', s
      );
      EXECUTE format(
        'CREATE INDEX idx_os_etapa ON %I.ordens_servico (etapa_id)', s
      );

      -- 3) Seed: 4 etapas reproduzindo o quadro atual (mapeadas ao status).
      -- Cor em HEX (aplicada via style inline no front — não é classe
      -- Tailwind, que não compilaria valores vindos do banco).
      EXECUTE format(
        'INSERT INTO %I.etapas_kanban (nome, cor, ordem, status_ao_entrar) VALUES
           (%L, %L, 1, %L),
           (%L, %L, 2, %L),
           (%L, %L, 3, %L),
           (%L, %L, 4, %L)', s,
        'Aberta',       '#94a3b8', 'aberta',        -- slate-400
        'Em andamento', '#D4A843', 'em_andamento',  -- ouro-500 (marca)
        'Finalizada',   '#283090', 'finalizada',    -- maninho-600 (marca)
        'Paga',         '#10b981', 'paga'           -- emerald-500
      );

      -- 4) Backfill: cada OS herda a etapa do seu status atual.
      EXECUTE format(
        'UPDATE %1$I.ordens_servico o
            SET etapa_id = e.id,
                etapa_entrou_em = COALESCE(o.aberta_em, now())
           FROM %1$I.etapas_kanban e
          WHERE e.status_ao_entrar = o.status', s
      );
    END IF;
  END LOOP;
END$$;

-- =====================================================================
-- ROLLBACK (rodar manualmente se precisar reverter):
--
-- DO $$
-- DECLARE s TEXT;
-- BEGIN
--   FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
--   LOOP
--     IF EXISTS (SELECT 1 FROM information_schema.tables
--                 WHERE table_schema = s AND table_name = 'etapas_kanban') THEN
--       EXECUTE format('ALTER TABLE %I.ordens_servico
--                         DROP COLUMN IF EXISTS etapa_id,
--                         DROP COLUMN IF EXISTS etapa_entrou_em', s);
--       EXECUTE format('DROP TABLE %I.etapas_kanban', s);
--     END IF;
--   END LOOP;
-- END$$;
-- DELETE FROM _migrations WHERE nome = '029_etapas_kanban.sql';
-- =====================================================================
