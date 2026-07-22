-- =====================================================================
-- 001_init.sql — Schema inicial: Auto Elétrica Maninho
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Usuários e autenticação
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('admin', 'atendente');

CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome          TEXT        NOT NULL,
    email         TEXT        NOT NULL UNIQUE,
    senha_hash    TEXT        NOT NULL,
    role          user_role   NOT NULL DEFAULT 'atendente',
    ativo         BOOLEAN     NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (lower(email));

-- ---------------------------------------------------------------------
-- Clientes
-- numero_cliente é sequencial e humano-legível (1, 2, 3...), separado do UUID.
--
-- Nota: NÃO usamos SEQUENCE aqui. Sequences não sofrem rollback, então um
-- INSERT que falhe numa constraint consome o número e deixa buraco (1, 3, 4...).
-- Como esse número é mostrado ao cliente, ele é atribuído por trigger BEFORE
-- INSERT, depois das constraints, garantindo numeração contínua.
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_cliente INTEGER     UNIQUE,
    nome           TEXT        NOT NULL,
    cpf_cnpj       TEXT        UNIQUE,
    telefone       TEXT        NOT NULL,   -- E.164, ex: +5551998887777
    email          TEXT,
    endereco       TEXT,
    observacoes    TEXT,
    ativo          BOOLEAN     NOT NULL DEFAULT TRUE,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_telefone_e164 CHECK (telefone ~ '^\+[1-9][0-9]{7,14}$')
);

-- Atribui o próximo número livre. O lock serializa inserções concorrentes de
-- clientes (operação de baixa frequência), evitando corrida por número duplicado.
CREATE OR REPLACE FUNCTION trg_set_numero_cliente() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_cliente IS NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('numero_cliente'));
        SELECT COALESCE(MAX(numero_cliente), 0) + 1 INTO NEW.numero_cliente FROM clientes;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_clientes_numero BEFORE INSERT ON clientes
    FOR EACH ROW EXECUTE FUNCTION trg_set_numero_cliente();

CREATE INDEX idx_clientes_nome     ON clientes USING gin (to_tsvector('portuguese', nome));
CREATE INDEX idx_clientes_telefone ON clientes (telefone);
CREATE INDEX idx_clientes_cpf_cnpj ON clientes (cpf_cnpj);

-- ---------------------------------------------------------------------
-- Carros (1 cliente -> N carros)
-- ---------------------------------------------------------------------
CREATE TABLE carros (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    placa         TEXT        NOT NULL UNIQUE,
    marca         TEXT        NOT NULL,
    modelo        TEXT        NOT NULL,
    ano           INTEGER,
    cor           TEXT,
    km_atual      INTEGER     CHECK (km_atual IS NULL OR km_atual >= 0),
    chassi        TEXT        UNIQUE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_ano CHECK (ano IS NULL OR (ano BETWEEN 1900 AND 2100))
);

CREATE INDEX idx_carros_cliente ON carros (cliente_id);
CREATE INDEX idx_carros_placa   ON carros (upper(replace(placa, '-', '')));

-- ---------------------------------------------------------------------
-- Catálogo de serviços
-- ---------------------------------------------------------------------
CREATE TABLE servicos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                TEXT           NOT NULL,
    descricao           TEXT,
    valor_padrao        NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (valor_padrao >= 0),
    tempo_estimado_min  INTEGER        CHECK (tempo_estimado_min IS NULL OR tempo_estimado_min > 0),
    ativo               BOOLEAN        NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMPTZ    NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_servicos_nome_unico ON servicos (lower(nome)) WHERE ativo;

-- ---------------------------------------------------------------------
-- Ordens de serviço
-- ---------------------------------------------------------------------
CREATE TYPE os_status AS ENUM ('aberta', 'em_andamento', 'finalizada', 'paga');

-- numero_os também é atribuído por trigger (mesma razão de numero_cliente):
-- é o número que vai no orçamento do cliente e não deve ter buracos.
CREATE TABLE ordens_servico (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_os      INTEGER       UNIQUE,
    cliente_id     UUID          NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    carro_id       UUID          NOT NULL REFERENCES carros(id)   ON DELETE RESTRICT,
    status         os_status     NOT NULL DEFAULT 'aberta',

    km_entrada     INTEGER       CHECK (km_entrada IS NULL OR km_entrada >= 0),
    observacoes    TEXT,

    -- Totais desnormalizados: recalculados por trigger a partir dos itens.
    -- Evita recomputar em todo relatório e mantém histórico se o catálogo mudar.
    valor_servicos NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_servicos >= 0),
    valor_pecas    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_pecas    >= 0),
    desconto       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (desconto       >= 0),
    valor_total    NUMERIC(10,2) NOT NULL DEFAULT 0,

    aberta_em      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fechada_em     TIMESTAMPTZ,
    paga_em        TIMESTAMPTZ,

    criado_por     UUID          REFERENCES users(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_fechada_apos_aberta CHECK (fechada_em IS NULL OR fechada_em >= aberta_em)
);

CREATE OR REPLACE FUNCTION trg_set_numero_os() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_os IS NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('numero_os'));
        SELECT COALESCE(MAX(numero_os), 0) + 1 INTO NEW.numero_os FROM ordens_servico;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_os_numero BEFORE INSERT ON ordens_servico
    FOR EACH ROW EXECUTE FUNCTION trg_set_numero_os();

CREATE INDEX idx_os_cliente    ON ordens_servico (cliente_id);
CREATE INDEX idx_os_carro      ON ordens_servico (carro_id);
CREATE INDEX idx_os_status     ON ordens_servico (status);
CREATE INDEX idx_os_aberta_em  ON ordens_servico (aberta_em DESC);
CREATE INDEX idx_os_fechada_em ON ordens_servico (fechada_em DESC) WHERE fechada_em IS NOT NULL;

-- Itens de serviço da OS.
-- nome_servico e valor_unit são COPIADOS do catálogo no momento da inclusão e
-- depois vivem soltos: cada OS cobra o valor daquele momento/negociação.
-- O catálogo é só sugestão de preço inicial — o atendente pode digitar outro.
-- Alterar o valor_padrao do catálogo NÃO mexe em nenhuma OS já lançada.
CREATE TABLE os_servicos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id         UUID          NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    servico_id    UUID          REFERENCES servicos(id) ON DELETE SET NULL,
    nome_servico  TEXT          NOT NULL,
    quantidade    INTEGER       NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    valor_unit    NUMERIC(10,2) NOT NULL CHECK (valor_unit >= 0),
    valor_total   NUMERIC(10,2) GENERATED ALWAYS AS (quantidade * valor_unit) STORED,
    criado_em     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_servicos_os      ON os_servicos (os_id);
CREATE INDEX idx_os_servicos_servico ON os_servicos (servico_id);

-- Peças: texto livre, sem catálogo/estoque
CREATE TABLE os_pecas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id       UUID          NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    descricao   TEXT          NOT NULL,
    quantidade  NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantidade > 0),
    valor_unit  NUMERIC(10,2) NOT NULL CHECK (valor_unit >= 0),
    valor_total NUMERIC(10,2) GENERATED ALWAYS AS (quantidade * valor_unit) STORED,
    criado_em   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_pecas_os ON os_pecas (os_id);

-- ---------------------------------------------------------------------
-- WhatsApp: log de mensagens
-- ---------------------------------------------------------------------
CREATE TYPE wa_direction    AS ENUM ('outbound', 'inbound');
CREATE TYPE wa_status       AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE wa_message_kind AS ENUM ('template', 'text', 'other');

CREATE TABLE wa_messages (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_message_id  TEXT UNIQUE,            -- id retornado pela Meta (wamid...)
    direction      wa_direction    NOT NULL,
    kind           wa_message_kind NOT NULL DEFAULT 'text',
    status         wa_status       NOT NULL DEFAULT 'queued',

    telefone       TEXT            NOT NULL,   -- E.164 da contraparte
    cliente_id     UUID REFERENCES clientes(id)       ON DELETE SET NULL,
    os_id          UUID REFERENCES ordens_servico(id) ON DELETE SET NULL,

    template_name  TEXT,
    body           TEXT,
    payload        JSONB,                  -- request enviado / webhook recebido, íntegro
    erro           JSONB,

    enviado_em     TIMESTAMPTZ,
    entregue_em    TIMESTAMPTZ,
    lido_em        TIMESTAMPTZ,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_telefone   ON wa_messages (telefone);
CREATE INDEX idx_wa_cliente    ON wa_messages (cliente_id);
CREATE INDEX idx_wa_os         ON wa_messages (os_id);
CREATE INDEX idx_wa_criado_em  ON wa_messages (criado_em DESC);
CREATE INDEX idx_wa_status     ON wa_messages (status);

-- Última mensagem INBOUND por telefone define a janela de 24h de texto livre.
CREATE INDEX idx_wa_janela ON wa_messages (telefone, criado_em DESC)
    WHERE direction = 'inbound';

-- ---------------------------------------------------------------------
-- Lembretes de revisão futura
-- ---------------------------------------------------------------------
CREATE TABLE lembretes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    carro_id      UUID        REFERENCES carros(id) ON DELETE CASCADE,
    os_id         UUID        REFERENCES ordens_servico(id) ON DELETE SET NULL,
    agendado_para DATE        NOT NULL,
    motivo        TEXT        NOT NULL,
    enviado       BOOLEAN     NOT NULL DEFAULT FALSE,
    enviado_em    TIMESTAMPTZ,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lembretes_pendentes ON lembretes (agendado_para) WHERE NOT enviado;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- atualizado_em automático
CREATE OR REPLACE FUNCTION trg_set_atualizado_em() RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_users_upd       BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();
CREATE TRIGGER t_clientes_upd    BEFORE UPDATE ON clientes       FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();
CREATE TRIGGER t_carros_upd      BEFORE UPDATE ON carros         FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();
CREATE TRIGGER t_servicos_upd    BEFORE UPDATE ON servicos       FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();
CREATE TRIGGER t_os_upd          BEFORE UPDATE ON ordens_servico FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();
CREATE TRIGGER t_wa_upd          BEFORE UPDATE ON wa_messages    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

-- Recalcula totais da OS sempre que itens mudam
CREATE OR REPLACE FUNCTION trg_recalc_os_totais() RETURNS TRIGGER AS $$
DECLARE
    v_os_id UUID := COALESCE(NEW.os_id, OLD.os_id);
BEGIN
    UPDATE ordens_servico o
       SET valor_servicos = COALESCE((SELECT SUM(valor_total) FROM os_servicos WHERE os_id = v_os_id), 0),
           valor_pecas    = COALESCE((SELECT SUM(valor_total) FROM os_pecas    WHERE os_id = v_os_id), 0)
     WHERE o.id = v_os_id;

    UPDATE ordens_servico
       SET valor_total = GREATEST(valor_servicos + valor_pecas - desconto, 0)
     WHERE id = v_os_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_os_servicos_totais AFTER INSERT OR UPDATE OR DELETE ON os_servicos
    FOR EACH ROW EXECUTE FUNCTION trg_recalc_os_totais();
CREATE TRIGGER t_os_pecas_totais AFTER INSERT OR UPDATE OR DELETE ON os_pecas
    FOR EACH ROW EXECUTE FUNCTION trg_recalc_os_totais();

-- Desconto alterado na própria OS também recalcula o total
CREATE OR REPLACE FUNCTION trg_recalc_os_desconto() RETURNS TRIGGER AS $$
BEGIN
    NEW.valor_total := GREATEST(NEW.valor_servicos + NEW.valor_pecas - NEW.desconto, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_os_desconto BEFORE UPDATE OF desconto, valor_servicos, valor_pecas
    ON ordens_servico FOR EACH ROW EXECUTE FUNCTION trg_recalc_os_desconto();

-- Carimba fechada_em / paga_em conforme o status muda
CREATE OR REPLACE FUNCTION trg_os_timestamps_status() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('finalizada','paga') AND OLD.status NOT IN ('finalizada','paga') THEN
        NEW.fechada_em := COALESCE(NEW.fechada_em, now());
    END IF;
    IF NEW.status = 'paga' AND OLD.status <> 'paga' THEN
        NEW.paga_em := COALESCE(NEW.paga_em, now());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_os_status BEFORE UPDATE OF status ON ordens_servico
    FOR EACH ROW EXECUTE FUNCTION trg_os_timestamps_status();

-- Coerência: carro precisa pertencer ao cliente informado na OS
CREATE OR REPLACE FUNCTION trg_valida_carro_cliente() RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM carros WHERE id = NEW.carro_id AND cliente_id = NEW.cliente_id) THEN
        RAISE EXCEPTION 'O carro informado não pertence a este cliente'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_os_carro_cliente BEFORE INSERT OR UPDATE OF carro_id, cliente_id
    ON ordens_servico FOR EACH ROW EXECUTE FUNCTION trg_valida_carro_cliente();

-- ---------------------------------------------------------------------
-- View de apoio para relatórios
-- Considera faturamento apenas OS finalizada/paga, datada por fechada_em.
-- ---------------------------------------------------------------------
CREATE VIEW vw_faturamento AS
SELECT
    o.id            AS os_id,
    o.numero_os,
    o.cliente_id,
    c.nome          AS cliente_nome,
    o.status,
    o.valor_total,
    o.paga_em,
    date_trunc('week',  o.paga_em) AS semana,
    date_trunc('month', o.paga_em) AS mes
FROM ordens_servico o
JOIN clientes c ON c.id = o.cliente_id
WHERE o.status = 'paga'
  AND o.paga_em IS NOT NULL;
