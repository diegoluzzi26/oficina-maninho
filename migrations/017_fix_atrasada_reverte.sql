-- =====================================================================
-- 017_fix_atrasada_reverte.sql
--
-- Bug antigo: `atualizar_despesas_atrasadas()` só empurrava pendente
-- pra atrasada quando o vencimento vencia. Nunca voltava. Resultado:
-- se o dono corrigia o vencimento pra uma data futura, a despesa ficava
-- marcada como "atrasada" pra sempre.
--
-- Agora a função também reverte: atrasada com vencimento >= hoje (ou
-- sem vencimento) volta a ser pendente na próxima sincronização.
-- =====================================================================

CREATE OR REPLACE FUNCTION atualizar_despesas_atrasadas() RETURNS INTEGER AS $$
DECLARE
    n_para_atrasada INTEGER;
    n_para_pendente INTEGER;
BEGIN
    UPDATE despesas
       SET status = 'atrasada'
     WHERE status = 'pendente'
       AND vencimento IS NOT NULL
       AND vencimento < CURRENT_DATE;
    GET DIAGNOSTICS n_para_atrasada = ROW_COUNT;

    UPDATE despesas
       SET status = 'pendente'
     WHERE status = 'atrasada'
       AND (vencimento IS NULL OR vencimento >= CURRENT_DATE);
    GET DIAGNOSTICS n_para_pendente = ROW_COUNT;

    RETURN n_para_atrasada + n_para_pendente;
END;
$$ LANGUAGE plpgsql;

-- Roda agora pra normalizar o estado atual (destrava #21, #22 e outras).
SELECT atualizar_despesas_atrasadas();
