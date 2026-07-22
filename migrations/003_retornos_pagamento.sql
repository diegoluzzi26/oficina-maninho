-- =====================================================================
-- 003_retornos_pagamento.sql
--   - Intervalo de retorno no catálogo (ex: troca de óleo → 6 meses)
--   - Forma de pagamento e valor pago na OS
--   - Extensão da tabela lembretes para virar "retornos" com status,
--     serviço de origem e histórico de contato
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo: cada serviço pode ter um intervalo padrão de retorno em meses.
-- NULL = não gera lembrete automático.
-- ---------------------------------------------------------------------
ALTER TABLE servicos
    ADD COLUMN intervalo_retorno_meses INTEGER
    CHECK (intervalo_retorno_meses IS NULL OR intervalo_retorno_meses > 0);

COMMENT ON COLUMN servicos.intervalo_retorno_meses IS
    'Meses até o próximo retorno recomendado. NULL = sem lembrete automático.';

-- ---------------------------------------------------------------------
-- OS: forma de pagamento e valor efetivamente pago (permite parcial).
-- Reusa o ENUM forma_pagamento criado no 002_financeiro.
-- ---------------------------------------------------------------------
ALTER TABLE ordens_servico
    ADD COLUMN forma_pagamento forma_pagamento,
    ADD COLUMN valor_pago      NUMERIC(10,2) CHECK (valor_pago IS NULL OR valor_pago >= 0);

-- Backfill de OS já pagas (seed/histórico): assume dinheiro e valor cheio.
-- Sem isso a constraint abaixo é violada por linhas legadas.
UPDATE ordens_servico
   SET forma_pagamento = 'dinheiro',
       valor_pago      = COALESCE(valor_pago, valor_total)
 WHERE status = 'paga' AND forma_pagamento IS NULL;

-- Se ficou paga, tem que ter forma e data.
ALTER TABLE ordens_servico
    ADD CONSTRAINT chk_os_paga_tem_forma
    CHECK (status <> 'paga' OR (forma_pagamento IS NOT NULL AND paga_em IS NOT NULL));

-- Trigger existente já preenche paga_em quando status vira 'paga'.
-- Aqui só garantimos que valor_pago default seja o total quando o
-- atendente não informa (evita null e cobre pagamento integral).
CREATE OR REPLACE FUNCTION trg_os_default_valor_pago() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paga' AND OLD.status <> 'paga' AND NEW.valor_pago IS NULL THEN
        NEW.valor_pago := NEW.valor_total;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_os_valor_pago BEFORE UPDATE OF status ON ordens_servico
    FOR EACH ROW EXECUTE FUNCTION trg_os_default_valor_pago();

-- ---------------------------------------------------------------------
-- Retornos (evolução da tabela `lembretes` original).
-- A tabela original só tinha `motivo` livre e `enviado` boolean. Agora
-- guardamos o serviço de origem, um status mais expressivo e o telefone
-- de contato no momento da criação (o do cliente pode mudar depois).
--
-- Migração dos dados existentes: como a tabela é feature nova, ainda
-- não há linhas em produção (o seed atual não cria lembretes). Só
-- renomeamos o campo `motivo` e adicionamos o resto.
-- ---------------------------------------------------------------------
CREATE TYPE retorno_status AS ENUM ('pendente', 'contatado', 'ignorado');

ALTER TABLE lembretes
    RENAME TO retornos;

ALTER TABLE retornos
    ADD COLUMN servico_id     UUID       REFERENCES servicos(id) ON DELETE SET NULL,
    ADD COLUMN nome_servico   TEXT,
    ADD COLUMN status         retorno_status NOT NULL DEFAULT 'pendente',
    ADD COLUMN contatado_em   TIMESTAMPTZ,
    ADD COLUMN wa_message_id  TEXT       REFERENCES wa_messages(wa_message_id) ON DELETE SET NULL;

-- Backfill: se por acaso houver lembretes antigos com `enviado=true`,
-- viram 'contatado'. Isso é defensivo — o seed atual não cria nenhum.
UPDATE retornos SET status = 'contatado', contatado_em = enviado_em
 WHERE enviado = TRUE;

ALTER TABLE retornos
    DROP COLUMN enviado,
    DROP COLUMN enviado_em;

-- Motivo passa a ser opcional (o nome do serviço já descreve na maioria dos casos).
ALTER TABLE retornos
    ALTER COLUMN motivo DROP NOT NULL;

DROP INDEX IF EXISTS idx_lembretes_pendentes;
CREATE INDEX idx_retornos_pendentes ON retornos (agendado_para)
    WHERE status = 'pendente';
CREATE INDEX idx_retornos_cliente ON retornos (cliente_id);
CREATE INDEX idx_retornos_status  ON retornos (status);

-- ---------------------------------------------------------------------
-- View: retornos com dados de contato "resolvidos" para consumo direto pela UI.
-- ---------------------------------------------------------------------
CREATE VIEW vw_retornos AS
SELECT
    r.id,
    r.cliente_id,
    c.nome        AS cliente_nome,
    c.telefone    AS cliente_telefone,
    r.carro_id,
    ca.placa,
    ca.marca || ' ' || ca.modelo AS carro_descricao,
    r.os_id,
    o.numero_os,
    r.servico_id,
    COALESCE(r.nome_servico, s.nome) AS servico_nome,
    r.agendado_para,
    r.motivo,
    r.status,
    r.contatado_em,
    r.wa_message_id,
    r.criado_em,
    (r.agendado_para - CURRENT_DATE)::int AS dias_para
FROM retornos r
JOIN clientes c        ON c.id = r.cliente_id
LEFT JOIN carros ca    ON ca.id = r.carro_id
LEFT JOIN ordens_servico o ON o.id = r.os_id
LEFT JOIN servicos s   ON s.id = r.servico_id;

-- ---------------------------------------------------------------------
-- Ao marcar itens de serviço numa OS, se o serviço tem
-- intervalo_retorno_meses, criamos um retorno provisório em pendente.
-- Só criamos quando a OS fica 'finalizada' ou 'paga' (não faz sentido
-- agendar retorno de OS ainda em aberto que pode ser cancelada).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_criar_retornos_da_os() RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    IF NEW.status IN ('finalizada','paga') AND OLD.status NOT IN ('finalizada','paga') THEN
        FOR r IN
            SELECT os.servico_id, os.nome_servico, s.intervalo_retorno_meses
              FROM os_servicos os
              JOIN servicos s ON s.id = os.servico_id
             WHERE os.os_id = NEW.id
               AND s.intervalo_retorno_meses IS NOT NULL
        LOOP
            -- Evita duplicar retorno se rodar duas vezes (finalizada -> paga)
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
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_os_criar_retornos AFTER UPDATE OF status ON ordens_servico
    FOR EACH ROW EXECUTE FUNCTION trg_criar_retornos_da_os();
