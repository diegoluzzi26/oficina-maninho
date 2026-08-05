-- =====================================================================
-- 022_relatorios_enviados.sql — Dedup dos relatórios automáticos
--
-- Registra qual período (mensal-YYYY-MM ou semanal-YYYY-Www) já foi
-- enviado por WhatsApp. Impede duplicação se o scheduler rodar duas
-- vezes no mesmo dia (ex: container reiniciado).
-- =====================================================================

CREATE TABLE relatorios_enviados (
    periodo        TEXT PRIMARY KEY,        -- ex: 'mensal-2026-07', 'semanal-2026-W30'
    tipo           TEXT NOT NULL,           -- 'mensal' | 'semanal'
    enviado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    wa_message_id  TEXT
);
