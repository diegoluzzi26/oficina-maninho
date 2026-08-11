-- =====================================================================
-- 023_role_basico.sql — Novo papel de usuário: 'basico'
--
-- Perfil enxuto pro mecânico/operador que só precisa abrir OS,
-- consultar OS existentes e ver a agenda. NÃO acessa clientes,
-- financeiro, despesas, configurações, follow-up nem catálogo pelo menu.
--
-- Backend: as rotas administrativas continuam bloqueadas pelo
-- requireRole('admin'), então 'basico' automaticamente não passa
-- por lá. A restrição fina (esconder pages) é aplicada no MENU do
-- frontend.
-- =====================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'basico';
