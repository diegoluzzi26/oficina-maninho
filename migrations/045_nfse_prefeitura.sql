-- =====================================================================
-- 045_nfse_prefeitura.sql — NFS-e pelo sistema próprio da prefeitura
-- (ex.: Gravataí, AtendeNet), emitida pela Focus com o login e a senha
-- que a oficina usa no site da prefeitura.
--
--   prefeitura_login        login do site da prefeitura (vai pra Focus)
--   prefeitura_senha_em     quando a senha foi enviada pra Focus. A senha
--                           em si NÃO é guardada aqui: vai direto pra Focus,
--                           como o certificado.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE oficina_fiscal
  ADD COLUMN IF NOT EXISTS prefeitura_login    TEXT,
  ADD COLUMN IF NOT EXISTS prefeitura_senha_em TIMESTAMPTZ;

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE oficina_fiscal
--     DROP COLUMN IF EXISTS prefeitura_login,
--     DROP COLUMN IF EXISTS prefeitura_senha_em;
--   DELETE FROM _migrations WHERE nome = '045_nfse_prefeitura.sql';
-- =====================================================================
