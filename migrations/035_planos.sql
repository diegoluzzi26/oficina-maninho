-- =====================================================================
-- 035_planos.sql — Plano comercial por oficina (essencial | profissional |
-- completo). O mapa de recursos e limites de cada plano vive em
-- src/config/planos.js; aqui só fixamos os valores válidos.
--
--   maninho (oficina-mãe)       -> completo
--   demais sem plano/valor livre -> profissional (plano de referência do trial)
--
-- Reversível: bloco comentado no fim. O rollback volta a coluna a texto
-- livre opcional; os valores gravados continuam válidos nesse formato.
-- =====================================================================

UPDATE oficinas SET plano = 'completo' WHERE slug = 'maninho';

UPDATE oficinas SET plano = 'profissional'
 WHERE plano IS NULL OR plano NOT IN ('essencial', 'profissional', 'completo');

ALTER TABLE oficinas
  ALTER COLUMN plano SET DEFAULT 'profissional',
  ALTER COLUMN plano SET NOT NULL,
  ADD CONSTRAINT oficinas_plano_check
    CHECK (plano IN ('essencial', 'profissional', 'completo'));

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE oficinas
--     DROP CONSTRAINT IF EXISTS oficinas_plano_check,
--     ALTER COLUMN plano DROP NOT NULL,
--     ALTER COLUMN plano DROP DEFAULT;
--   DELETE FROM _migrations WHERE nome = '035_planos.sql';
-- =====================================================================
