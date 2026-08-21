-- =====================================================================
-- 025_multi_oficina_setup.sql — Fundação multi-oficina (Fase 1a)
--
-- Fase 1a: só adiciona metadata. NADA de dados é movido. O sistema
-- continua funcionando 100% como antes — a única diferença visível é
-- o dropdown de "Oficina" no login (que auto-esconde quando só há uma).
--
-- Prepara o terreno pra:
--   Fase 1b — mover tabelas de dados pra schema oficina_<slug>
--   Fase 2  — provisionar novas oficinas via UI
--
-- IMPORTANTE: `_migrations`, `oficinas` e `users` permanecem no schema
-- `public`. São metadata global. Depois da 1b, tudo o resto vai pra
-- schema por oficina.
-- =====================================================================

CREATE TABLE oficinas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug          TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9_]+$'),
    nome          TEXT NOT NULL,
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE oficinas IS
    'Cadastro das oficinas que compartilham este servidor. Cada oficina
     terá seu próprio schema Postgres (oficina_<slug>) a partir da 1b.';

-- Cadastra a oficina atual (a que já existe rodando)
INSERT INTO oficinas (slug, nome) VALUES ('maninho', 'Auto Elétrica Maninho');

-- Cada usuário pertence a uma oficina. Backfill: todos usuários
-- existentes ficam na 'maninho'. NOT NULL vem depois do backfill.
ALTER TABLE users ADD COLUMN oficina_id UUID REFERENCES oficinas(id) ON DELETE RESTRICT;

UPDATE users SET oficina_id = (SELECT id FROM oficinas WHERE slug = 'maninho');

ALTER TABLE users ALTER COLUMN oficina_id SET NOT NULL;

-- Constraint: (email, oficina_id) único. Dois donos de oficinas
-- diferentes podem, em tese, ter o mesmo email — o unique global antigo
-- não faz mais sentido. Mas o unique por oficina sim.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX idx_users_email_oficina ON users (lower(email), oficina_id);

CREATE INDEX idx_users_oficina ON users (oficina_id);
