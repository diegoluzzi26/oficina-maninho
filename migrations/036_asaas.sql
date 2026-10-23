-- =====================================================================
-- 036_asaas.sql — Integração de cobrança com o Asaas (Fase B).
--
-- Guarda, por oficina, os IDs do Asaas pra amarrar os webhooks de
-- pagamento à oficina certa:
--   asaas_customer_id      cliente no Asaas (cus_...)
--   asaas_subscription_id  assinatura recorrente no Asaas (sub_...)
--
-- O webhook de pagamento (PAYMENT_CONFIRMED/RECEIVED/OVERDUE) encontra a
-- oficina por esses IDs e atualiza assinatura_status/proximo_vencimento.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS asaas_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_oficinas_asaas_sub
  ON oficinas (asaas_subscription_id) WHERE asaas_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oficinas_asaas_cus
  ON oficinas (asaas_customer_id) WHERE asaas_customer_id IS NOT NULL;

-- =====================================================================
-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS idx_oficinas_asaas_sub;
--   DROP INDEX IF EXISTS idx_oficinas_asaas_cus;
--   ALTER TABLE oficinas
--     DROP COLUMN IF EXISTS asaas_customer_id,
--     DROP COLUMN IF EXISTS asaas_subscription_id;
--   DELETE FROM _migrations WHERE nome = '036_asaas.sql';
-- =====================================================================
