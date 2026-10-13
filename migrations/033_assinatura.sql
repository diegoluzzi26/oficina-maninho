-- =====================================================================
-- 033_assinatura.sql — Assinatura por oficina (Fase A: modelo + status,
-- sem provedor de pagamento ainda).
--
-- Campos em public.oficinas (metadata da plataforma):
--   assinatura_status  trial | ativa | inadimplente | cancelada
--   plano              rótulo livre do plano (ex: 'mensal'), opcional
--   trial_fim          fim do período de teste (DATE)
--   proximo_vencimento próxima data de cobrança (DATE)
--   graca_dias         dias de tolerância após vencimento/trial antes de bloquear
--
-- Enforcement (middleware exigirAssinatura) deriva "bloqueada" desses
-- campos. Super-admin e a oficina-mãe (maninho) nunca são bloqueados.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS assinatura_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (assinatura_status IN ('trial','ativa','inadimplente','cancelada')),
  ADD COLUMN IF NOT EXISTS plano              TEXT,
  ADD COLUMN IF NOT EXISTS trial_fim          DATE,
  ADD COLUMN IF NOT EXISTS proximo_vencimento DATE,
  ADD COLUMN IF NOT EXISTS graca_dias         INTEGER NOT NULL DEFAULT 5
    CHECK (graca_dias >= 0);

-- A oficina-mãe (dona da plataforma) é sempre ativa.
UPDATE oficinas SET assinatura_status = 'ativa' WHERE slug = 'maninho';

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE oficinas
--     DROP COLUMN IF EXISTS assinatura_status,
--     DROP COLUMN IF EXISTS plano,
--     DROP COLUMN IF EXISTS trial_fim,
--     DROP COLUMN IF EXISTS proximo_vencimento,
--     DROP COLUMN IF EXISTS graca_dias;
--   DELETE FROM _migrations WHERE nome = '033_assinatura.sql';
-- =====================================================================
