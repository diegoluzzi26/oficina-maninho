-- =====================================================================
-- 037_identidade_visual.sql — Logo e cores de cada oficina.
--
-- Fica em public.oficinas (e não no schema da oficina) porque a tela de
-- login mostra a logo ANTES de existir usuário/contexto de oficina.
--
--   logo               imagem (PNG/JPG/WebP, até 1 MB) guardada no banco —
--                      sobrevive a rebuild de container sem volume extra
--   logo_mime          content-type da imagem
--   logo_atualizada_em versão da logo (cache-busting na URL pública)
--   cor_primaria       cor principal da oficina (#rrggbb)
--   cor_secundaria     cor de destaque da oficina (#rrggbb)
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS logo               BYTEA,
  ADD COLUMN IF NOT EXISTS logo_mime          TEXT,
  ADD COLUMN IF NOT EXISTS logo_atualizada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cor_primaria       TEXT
    CHECK (cor_primaria ~ '^#[0-9a-f]{6}$'),
  ADD COLUMN IF NOT EXISTS cor_secundaria     TEXT
    CHECK (cor_secundaria ~ '^#[0-9a-f]{6}$');

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE oficinas
--     DROP COLUMN IF EXISTS logo,
--     DROP COLUMN IF EXISTS logo_mime,
--     DROP COLUMN IF EXISTS logo_atualizada_em,
--     DROP COLUMN IF EXISTS cor_primaria,
--     DROP COLUMN IF EXISTS cor_secundaria;
--   DELETE FROM _migrations WHERE nome = '037_identidade_visual.sql';
-- =====================================================================
