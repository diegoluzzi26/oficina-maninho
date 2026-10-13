-- =====================================================================
-- 032_super_admin.sql — Papel de "super-admin" da plataforma.
--
-- Diferente do role por-oficina (admin/atendente/basico), o super_admin é
-- o dono da PLATAFORMA: pode provisionar oficinas novas. Flag simples em
-- public.users (metadata compartilhada), não um valor do enum user_role
-- (que é escopo de oficina).
--
-- Seed: os admins da Maninho viram super-admin, pra existir pelo menos um
-- que consiga criar as primeiras oficinas.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS super_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.super_admin IS
  'Dono da plataforma: pode provisionar oficinas novas. Independe do role por-oficina.';

UPDATE users SET super_admin = TRUE
 WHERE role = 'admin'
   AND oficina_id = (SELECT id FROM oficinas WHERE slug = 'maninho');

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE users DROP COLUMN IF EXISTS super_admin;
--   DELETE FROM _migrations WHERE nome = '032_super_admin.sql';
-- =====================================================================
