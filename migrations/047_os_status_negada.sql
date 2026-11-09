-- =====================================================================
-- 047_os_status_negada.sql — Status 'negada' (orçamento negado) na OS
--
-- O orçamento recusado pelo cliente fica salvo como OS com status próprio,
-- fora da fila de trabalho e dos valores pendentes dos relatórios.
--
-- Fica sozinha neste arquivo porque um valor novo de enum não pode ser
-- usado na mesma transação em que foi criado (a 048 é quem usa).
--
-- Reversível: bloco comentado no fim. Rodar antes o rollback da 048.
-- =====================================================================

ALTER TYPE public.os_status ADD VALUE IF NOT EXISTS 'negada';

-- =====================================================================
-- ROLLBACK (rodar manualmente, depois do rollback da 048):
--
-- DELETE FROM pg_enum
--  WHERE enumtypid = 'public.os_status'::regtype AND enumlabel = 'negada';
-- DELETE FROM _migrations WHERE nome = '047_os_status_negada.sql';
-- =====================================================================
