-- =====================================================================
-- 040_adicionais.sql — Adicionais contratados à parte do plano.
--
-- public.oficinas.adicionais guarda as chaves dos adicionais da oficina.
-- Preço, recurso liberado e planos compatíveis vivem em
-- src/config/planos.js (ADICIONAIS); aqui só fixamos os valores válidos.
--
--   fiscal   emissão de NFS-e/NF-e (Profissional e Completo)
--
-- Nenhuma oficina começa com adicional.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS adicionais TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT oficinas_adicionais_check
    CHECK (adicionais <@ ARRAY['fiscal']::TEXT[]);

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE oficinas
--     DROP CONSTRAINT IF EXISTS oficinas_adicionais_check,
--     DROP COLUMN IF EXISTS adicionais;
--   DELETE FROM _migrations WHERE nome = '040_adicionais.sql';
-- =====================================================================
