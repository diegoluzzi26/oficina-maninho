-- =====================================================================
-- 020_followup_avaliacao.sql — Novo tipo `avaliacao`
--
-- Dispara N dias depois de QUALQUER OS paga ou finalizada (independente
-- do serviço). Uso típico: pedir avaliação no Google 3–5 dias após o
-- cliente sair da oficina.
--
-- Difere de `manutencao` porque não amarra a um servico_id do catálogo.
-- Difere de `reativacao` porque a janela é curta e o gatilho é
-- "cliente atendido recentemente", não "cliente sumido".
--
-- A seed da regra pronta vai numa migration separada (021), porque
-- PostgreSQL não deixa usar valor novo de enum na mesma transação em
-- que ele foi adicionado.
-- =====================================================================

ALTER TYPE followup_tipo ADD VALUE IF NOT EXISTS 'avaliacao';
