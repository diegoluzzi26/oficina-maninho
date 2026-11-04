-- =====================================================================
-- 043_tributacao_nfe.sql — Tributação padrão da NF-e de peças, por
-- oficina (public.oficina_fiscal). Quem define é o contador da oficina;
-- os defaults são os mais comuns pra revenda no Simples Nacional.
--
--   csosn_padrao     CSOSN da peça sem substituição tributária (102)
--   csosn_st         CSOSN da peça com ST já recolhida, ou seja, com CEST
--                    no catálogo (500)
--   pis_cofins_cst   CST de PIS e COFINS (49 = outras operações de saída)
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE oficina_fiscal
  ADD COLUMN IF NOT EXISTS csosn_padrao   TEXT NOT NULL DEFAULT '102'
    CHECK (csosn_padrao IN ('101', '102', '103', '201', '202', '203', '300', '400', '500', '900')),
  ADD COLUMN IF NOT EXISTS csosn_st       TEXT NOT NULL DEFAULT '500'
    CHECK (csosn_st IN ('101', '102', '103', '201', '202', '203', '300', '400', '500', '900')),
  ADD COLUMN IF NOT EXISTS pis_cofins_cst TEXT NOT NULL DEFAULT '49'
    CHECK (pis_cofins_cst ~ '^[0-9]{2}$');

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE oficina_fiscal
--     DROP COLUMN IF EXISTS csosn_padrao,
--     DROP COLUMN IF EXISTS csosn_st,
--     DROP COLUMN IF EXISTS pis_cofins_cst;
--   DELETE FROM _migrations WHERE nome = '043_tributacao_nfe.sql';
-- =====================================================================
