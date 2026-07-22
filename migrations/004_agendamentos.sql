-- =====================================================================
-- 004_agendamentos.sql — Agenda de serviços futuros
--
-- Um agendamento é a intenção de fazer um serviço num dia/hora futuros.
-- Não tem valor nem status de pagamento — quando o carro chega, o
-- agendamento é convertido em OS (que aí sim carrega os itens, valores
-- e ciclo de status próprio).
-- =====================================================================

CREATE TYPE agendamento_status AS ENUM ('agendado', 'concluido', 'cancelado');

CREATE TABLE agendamentos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id     UUID          NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    carro_id       UUID          NOT NULL REFERENCES carros(id)   ON DELETE RESTRICT,

    data_agendada  TIMESTAMPTZ   NOT NULL,
    duracao_min    INTEGER       NOT NULL DEFAULT 60
                                 CHECK (duracao_min > 0 AND duracao_min <= 720),
    observacoes    TEXT,

    status         agendamento_status NOT NULL DEFAULT 'agendado',

    -- Preenchido quando o agendamento vira OS de verdade.
    os_id          UUID          REFERENCES ordens_servico(id) ON DELETE SET NULL,

    criado_por     UUID          REFERENCES users(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_agend_data ON agendamentos (data_agendada);
CREATE INDEX idx_agend_status_data ON agendamentos (status, data_agendada);
CREATE INDEX idx_agend_cliente ON agendamentos (cliente_id);
CREATE INDEX idx_agend_carro ON agendamentos (carro_id);

CREATE TRIGGER t_agend_upd BEFORE UPDATE ON agendamentos
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

-- Itens do agendamento: mesmo padrão de os_servicos, mas sem valor
-- (o valor entra quando o item vira linha da OS de verdade).
CREATE TABLE agendamento_servicos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agendamento_id  UUID NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    servico_id      UUID REFERENCES servicos(id) ON DELETE SET NULL,
    nome_servico    TEXT NOT NULL,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agend_servicos_agend ON agendamento_servicos (agendamento_id);

-- View pronta pra consumo pela UI: já traz cliente/carro/contagem de serviços.
CREATE VIEW vw_agendamentos AS
SELECT
    a.id,
    a.cliente_id,
    c.nome        AS cliente_nome,
    c.telefone    AS cliente_telefone,
    a.carro_id,
    ca.placa,
    ca.marca,
    ca.modelo,
    a.data_agendada,
    a.duracao_min,
    a.observacoes,
    a.status,
    a.os_id,
    o.numero_os,
    a.criado_em,
    a.atualizado_em,
    (SELECT count(*) FROM agendamento_servicos WHERE agendamento_id = a.id)::int AS qtd_servicos
FROM agendamentos a
JOIN clientes c        ON c.id  = a.cliente_id
JOIN carros ca         ON ca.id = a.carro_id
LEFT JOIN ordens_servico o ON o.id = a.os_id;
