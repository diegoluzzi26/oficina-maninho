-- =====================================================================
-- 042_catalogo_fiscal.sql — Catálogo de peças pronto pra NF-e.
--
-- public.ncm           tabela NCM oficial (Portal Único Siscomex), só os
--                      códigos de 8 dígitos (os que vão na NF-e). Carregada
--                      pela aplicação (scripts/importar-ncm.js e na subida
--                      da api quando vazia/velha), não por esta migration.
--                        descricao          texto do próprio código
--                        descricao_completa capítulo > posição > ... > código
--                        busca              descricao_completa sem acento,
--                                           minúscula (pra busca por palavra)
--   ncm_importacao     uma linha: quando e de qual ato veio a tabela carregada
--
-- Em cada oficina_<slug>:
--   pecas.cest          CEST (7 dígitos), exigido na NF-e de autopeças (ST)
--   os_pecas.cest       idem, o valor do momento na OS
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ncm (
  codigo             TEXT PRIMARY KEY CHECK (codigo ~ '^[0-9]{8}$'),
  descricao          TEXT NOT NULL,
  descricao_completa TEXT NOT NULL,
  busca              TEXT NOT NULL,
  data_inicio        DATE,
  data_fim           DATE
);

CREATE TABLE IF NOT EXISTS ncm_importacao (
  id            BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  ato           TEXT,
  vigencia      TEXT,
  total         INTEGER NOT NULL,
  importada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'pecas'
    );
    EXECUTE format(
      'ALTER TABLE %I.pecas ADD COLUMN IF NOT EXISTS cest TEXT CHECK (cest ~ ''^[0-9]{7}$'')', s);
    EXECUTE format(
      'ALTER TABLE %I.os_pecas ADD COLUMN IF NOT EXISTS cest TEXT CHECK (cest ~ ''^[0-9]{7}$'')', s);
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
--     CONTINUE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables
--                                WHERE table_schema = s AND table_name = 'pecas');
--     EXECUTE format('ALTER TABLE %I.os_pecas DROP COLUMN IF EXISTS cest', s);
--     EXECUTE format('ALTER TABLE %I.pecas DROP COLUMN IF EXISTS cest', s);
--   END LOOP;
-- END$$;
-- DROP TABLE IF EXISTS ncm_importacao;
-- DROP TABLE IF EXISTS ncm;
-- DELETE FROM _migrations WHERE nome = '042_catalogo_fiscal.sql';
-- =====================================================================
