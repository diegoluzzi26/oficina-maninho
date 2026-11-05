-- =====================================================================
-- 046_aliquota_simples.sql — Alíquota efetiva do Simples Nacional da
-- oficina (%, a do extrato do DAS). A NFS-e Nacional de ME/EPP exige o
-- percentual aproximado de tributos do Simples (pTotTribSN) e recusa o
-- indicador genérico de tributos.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE oficina_fiscal
  ADD COLUMN IF NOT EXISTS aliquota_simples NUMERIC(5,2)
    CHECK (aliquota_simples IS NULL OR aliquota_simples BETWEEN 0 AND 33);

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE oficina_fiscal DROP COLUMN IF EXISTS aliquota_simples;
--   DELETE FROM _migrations WHERE nome = '046_aliquota_simples.sql';
-- =====================================================================
