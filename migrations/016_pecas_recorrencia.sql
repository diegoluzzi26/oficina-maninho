-- =====================================================================
-- 016_pecas_recorrencia.sql — Intervalo de retorno também para peças
--
-- Mesma ideia do serviço: peças (filtro, bateria, óleo, correia...) têm
-- vida útil e a oficina quer avisar o cliente quando chegar perto de
-- trocar de novo. Antes só serviços geravam retorno automático — agora
-- peças também.
--
-- A tabela `retornos` não muda: seguimos usando `nome_servico` como
-- rótulo (o CTE do trigger preenche com o nome da peça).
-- =====================================================================

ALTER TABLE pecas
    ADD COLUMN intervalo_retorno_meses INTEGER
    CHECK (intervalo_retorno_meses IS NULL OR intervalo_retorno_meses > 0);

COMMENT ON COLUMN pecas.intervalo_retorno_meses IS
    'Meses até a próxima troca recomendada. NULL = sem retorno automático.';

-- Recria o trigger pra também emitir retornos para peças com intervalo.
-- Estrutura: um bloco por serviço (igual antes) + um bloco por peça.
CREATE OR REPLACE FUNCTION trg_criar_retornos_da_os() RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    IF NEW.status IN ('finalizada','paga') AND OLD.status NOT IN ('finalizada','paga') THEN

        -- Serviços do catálogo com retorno configurado
        FOR r IN
            SELECT os.servico_id, os.nome_servico, s.intervalo_retorno_meses
              FROM os_servicos os
              JOIN servicos s ON s.id = os.servico_id
             WHERE os.os_id = NEW.id
               AND s.intervalo_retorno_meses IS NOT NULL
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM retornos
                 WHERE os_id = NEW.id AND servico_id = r.servico_id
            ) THEN
                INSERT INTO retornos (cliente_id, carro_id, os_id, servico_id,
                                      nome_servico, agendado_para, motivo)
                VALUES (
                    NEW.cliente_id, NEW.carro_id, NEW.id, r.servico_id,
                    r.nome_servico,
                    (CURRENT_DATE + (r.intervalo_retorno_meses || ' months')::interval)::date,
                    r.nome_servico
                );
            END IF;
        END LOOP;

        -- Peças do catálogo com retorno configurado.
        -- Retornos de peça ficam com servico_id NULL — o nome vai em
        -- nome_servico (a view vw_retornos usa COALESCE).
        FOR r IN
            SELECT op.peca_id, p.nome AS nome_peca, p.intervalo_retorno_meses
              FROM os_pecas op
              JOIN pecas p ON p.id = op.peca_id
             WHERE op.os_id = NEW.id
               AND p.intervalo_retorno_meses IS NOT NULL
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM retornos
                 WHERE os_id = NEW.id AND nome_servico = r.nome_peca AND servico_id IS NULL
            ) THEN
                INSERT INTO retornos (cliente_id, carro_id, os_id, servico_id,
                                      nome_servico, agendado_para, motivo)
                VALUES (
                    NEW.cliente_id, NEW.carro_id, NEW.id, NULL,
                    r.nome_peca,
                    (CURRENT_DATE + (r.intervalo_retorno_meses || ' months')::interval)::date,
                    'Troca de ' || r.nome_peca
                );
            END IF;
        END LOOP;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
