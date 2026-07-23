-- =====================================================================
-- 005_configuracoes.sql — Configurações editáveis em runtime
--
-- Tabela chave/valor pra sobrescrever o que hoje mora no .env sem
-- precisar reiniciar container. env.js continua valendo como default:
-- se a chave NÃO existe no banco, cai no env; se EXISTE, banco vence.
--
-- Escopo inicial: só WhatsApp. Estrutura genérica pra crescer depois.
-- =====================================================================

CREATE TABLE configuracoes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave          TEXT UNIQUE NOT NULL,
    valor          TEXT,
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_por UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE TRIGGER t_config_upd BEFORE UPDATE ON configuracoes
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();
