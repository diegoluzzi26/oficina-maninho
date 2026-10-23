-- =====================================================================
-- 039_permissoes_acessos.sql — Permissões por usuário e métricas de uso
-- da plataforma.
--
--   users.permissoes       módulos que o usuário enxerga (ver
--                          src/config/permissoes.js). NULL = padrão do papel,
--                          então quem já existe continua igual.
--   users.ultimo_acesso_em último login do usuário.
--   oficinas.ciclo         mensal | anual (define o valor cobrado do plano).
--   acessos_login          um registro por login, pra contar acessos por
--                          oficina no painel do super-admin.
--   visitas_site           visitas da landing por dia (contador agregado,
--                          sem guardar IP nem nada que identifique alguém).
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS permissoes       TEXT[],
  ADD COLUMN IF NOT EXISTS ultimo_acesso_em TIMESTAMPTZ;

ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS ciclo TEXT NOT NULL DEFAULT 'mensal'
    CHECK (ciclo IN ('mensal', 'anual'));

CREATE TABLE IF NOT EXISTS acessos_login (
  id         BIGSERIAL PRIMARY KEY,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_acessos_login_oficina
  ON acessos_login (oficina_id, criado_em);

CREATE TABLE IF NOT EXISTS visitas_site (
  dia    DATE    NOT NULL,
  pagina TEXT    NOT NULL,
  total  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, pagina)
);

-- =====================================================================
-- ROLLBACK (manual):
--   DROP TABLE IF EXISTS visitas_site;
--   DROP TABLE IF EXISTS acessos_login;
--   ALTER TABLE oficinas DROP COLUMN IF EXISTS ciclo;
--   ALTER TABLE users
--     DROP COLUMN IF EXISTS permissoes,
--     DROP COLUMN IF EXISTS ultimo_acesso_em;
--   DELETE FROM _migrations WHERE nome = '039_permissoes_acessos.sql';
-- =====================================================================
