-- =====================================================================
-- 002_financeiro.sql — Fornecedores, despesas/boletos e formas de pagamento
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fornecedores
-- ---------------------------------------------------------------------
CREATE TABLE fornecedores (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_forn    INTEGER     UNIQUE,
    nome           TEXT        NOT NULL,
    cnpj_cpf       TEXT        UNIQUE,
    telefone       TEXT,
    email          TEXT,
    endereco       TEXT,
    contato        TEXT,              -- nome do vendedor/representante
    observacoes    TEXT,
    ativo          BOOLEAN     NOT NULL DEFAULT TRUE,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Telefone opcional aqui (nem todo fornecedor tem WhatsApp cadastrado),
    -- mas se vier, precisa estar em E.164 como no resto do sistema.
    CONSTRAINT chk_forn_telefone CHECK (telefone IS NULL OR telefone ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX idx_forn_nome ON fornecedores (lower(nome));
CREATE INDEX idx_forn_ativo ON fornecedores (ativo) WHERE ativo;

CREATE OR REPLACE FUNCTION trg_set_numero_forn() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_forn IS NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('numero_forn'));
        SELECT COALESCE(MAX(numero_forn), 0) + 1 INTO NEW.numero_forn FROM fornecedores;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_forn_numero BEFORE INSERT ON fornecedores
    FOR EACH ROW EXECUTE FUNCTION trg_set_numero_forn();

CREATE TRIGGER t_forn_upd BEFORE UPDATE ON fornecedores
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

-- ---------------------------------------------------------------------
-- Categorias de despesa
-- Tabela em vez de ENUM: o dono pode criar categorias próprias sem migration.
-- ---------------------------------------------------------------------
CREATE TABLE categorias_despesa (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome      TEXT    NOT NULL,
    cor       TEXT    NOT NULL DEFAULT '#64748b',  -- usada nos gráficos
    ordem     INTEGER NOT NULL DEFAULT 100,
    ativo     BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_cat_nome ON categorias_despesa (lower(nome)) WHERE ativo;

INSERT INTO categorias_despesa (nome, cor, ordem) VALUES
    ('Peças e materiais', '#2B3D8F', 10),
    ('Aluguel',           '#7c3aed', 20),
    ('Salários',          '#0891b2', 30),
    ('Energia e água',    '#ea580c', 40),
    ('Ferramentas',       '#D4A843', 50),
    ('Impostos e taxas',  '#dc2626', 60),
    ('Combustível',       '#65a30d', 70),
    ('Marketing',         '#db2777', 80),
    ('Manutenção',        '#0d9488', 90),
    ('Outros',            '#64748b', 999);

-- ---------------------------------------------------------------------
-- Formas de pagamento
-- ---------------------------------------------------------------------
CREATE TYPE forma_pagamento AS ENUM (
    'dinheiro', 'pix', 'boleto', 'cartao_credito',
    'cartao_debito', 'transferencia', 'cheque', 'outro'
);

-- ---------------------------------------------------------------------
-- Despesas (boleto = despesa com vencimento)
-- ---------------------------------------------------------------------
CREATE TYPE status_despesa AS ENUM ('pendente', 'paga', 'atrasada', 'cancelada');

CREATE TABLE despesas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_despesa INTEGER     UNIQUE,

    descricao      TEXT           NOT NULL,
    categoria_id   UUID           REFERENCES categorias_despesa(id) ON DELETE SET NULL,
    fornecedor_id  UUID           REFERENCES fornecedores(id)       ON DELETE SET NULL,

    valor          NUMERIC(12,2)  NOT NULL CHECK (valor > 0),
    forma          forma_pagamento NOT NULL DEFAULT 'boleto',

    -- Quando há vencimento, a despesa aparece na aba Boletos e nos alertas.
    -- Sem vencimento = despesa avulsa (ex: almoço pago no dinheiro).
    vencimento     DATE,
    competencia    DATE           NOT NULL DEFAULT date_trunc('month', now())::date,

    status         status_despesa NOT NULL DEFAULT 'pendente',
    pago_em        DATE,
    valor_pago     NUMERIC(12,2)  CHECK (valor_pago IS NULL OR valor_pago >= 0),

    -- Dados típicos de boleto
    codigo_barras  TEXT,
    numero_doc     TEXT,           -- nº da nota/duplicata
    anexo_url      TEXT,

    observacoes    TEXT,
    recorrente     BOOLEAN        NOT NULL DEFAULT FALSE,

    criado_por     UUID           REFERENCES users(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ    NOT NULL DEFAULT now(),

    -- Uma despesa paga precisa ter data de pagamento registrada
    CONSTRAINT chk_paga_tem_data CHECK (status <> 'paga' OR pago_em IS NOT NULL)
);

CREATE INDEX idx_desp_vencimento  ON despesas (vencimento) WHERE vencimento IS NOT NULL;
CREATE INDEX idx_desp_status      ON despesas (status);
CREATE INDEX idx_desp_competencia ON despesas (competencia DESC);
CREATE INDEX idx_desp_fornecedor  ON despesas (fornecedor_id);
CREATE INDEX idx_desp_categoria   ON despesas (categoria_id);
CREATE INDEX idx_desp_forma       ON despesas (forma);

-- A vencer: consulta mais quente do sistema (alertas e aba Boletos)
CREATE INDEX idx_desp_a_vencer ON despesas (vencimento)
    WHERE status IN ('pendente', 'atrasada') AND vencimento IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_set_numero_despesa() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_despesa IS NULL THEN
        PERFORM pg_advisory_xact_lock(hashtext('numero_despesa'));
        SELECT COALESCE(MAX(numero_despesa), 0) + 1 INTO NEW.numero_despesa FROM despesas;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_desp_numero BEFORE INSERT ON despesas
    FOR EACH ROW EXECUTE FUNCTION trg_set_numero_despesa();

CREATE TRIGGER t_desp_upd BEFORE UPDATE ON despesas
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

/**
 * Coerência de pagamento:
 * - marcar como paga sem data -> usa hoje
 * - marcar como paga sem valor_pago -> usa o valor cheio
 * - voltar para pendente -> limpa os dados de pagamento
 */
CREATE OR REPLACE FUNCTION trg_despesa_pagamento() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'paga' THEN
        NEW.pago_em    := COALESCE(NEW.pago_em, CURRENT_DATE);
        NEW.valor_pago := COALESCE(NEW.valor_pago, NEW.valor);
    ELSIF NEW.status IN ('pendente', 'atrasada') THEN
        NEW.pago_em    := NULL;
        NEW.valor_pago := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_desp_pagamento BEFORE INSERT OR UPDATE ON despesas
    FOR EACH ROW EXECUTE FUNCTION trg_despesa_pagamento();

/**
 * Marca como 'atrasada' o que venceu e não foi pago.
 * Chamada pela API a cada consulta de despesas — mais confiável que cron,
 * porque não depende de nenhum agendador estar rodando.
 */
CREATE OR REPLACE FUNCTION atualizar_despesas_atrasadas() RETURNS INTEGER AS $$
DECLARE
    n INTEGER;
BEGIN
    UPDATE despesas
       SET status = 'atrasada'
     WHERE status = 'pendente'
       AND vencimento IS NOT NULL
       AND vencimento < CURRENT_DATE;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Log de alertas de vencimento
-- Evita mandar o mesmo aviso de WhatsApp várias vezes no mesmo dia.
-- ---------------------------------------------------------------------
CREATE TABLE alertas_despesa (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    despesa_id  UUID NOT NULL REFERENCES despesas(id) ON DELETE CASCADE,
    tipo        TEXT NOT NULL,       -- 'previa_3d', 'vence_hoje', 'atrasada'
    enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    canal       TEXT NOT NULL DEFAULT 'whatsapp',
    wa_message_id TEXT,

    UNIQUE (despesa_id, tipo)
);

CREATE INDEX idx_alertas_despesa ON alertas_despesa (despesa_id);

-- ---------------------------------------------------------------------
-- Views de análise
-- ---------------------------------------------------------------------

-- Despesas com dados já resolvidos, para não repetir JOIN em toda consulta
CREATE VIEW vw_despesas AS
SELECT
    d.*,
    c.nome  AS categoria_nome,
    c.cor   AS categoria_cor,
    f.nome  AS fornecedor_nome,
    f.telefone AS fornecedor_telefone,
    -- Negativo = já venceu; 0 = vence hoje
    CASE WHEN d.vencimento IS NULL THEN NULL
         ELSE (d.vencimento - CURRENT_DATE) END AS dias_para_vencer
FROM despesas d
LEFT JOIN categorias_despesa c ON c.id = d.categoria_id
LEFT JOIN fornecedores f       ON f.id = d.fornecedor_id
WHERE d.status <> 'cancelada';

/**
 * Fluxo de caixa mensal: entradas (OS pagas) vs saídas (despesas pagas).
 *
 * Despesa é datada por pago_em, igual ao faturamento que usa paga_em.
 * Mantém o mesmo critério dos dois lados: dinheiro que efetivamente
 * entrou contra dinheiro que efetivamente saiu.
 */
CREATE VIEW vw_fluxo_mensal AS
WITH entradas AS (
    SELECT date_trunc('month', paga_em)::date AS mes,
           SUM(valor_total)                   AS receita,
           COUNT(*)                           AS qtd_os
      FROM ordens_servico
     WHERE status = 'paga' AND paga_em IS NOT NULL
     GROUP BY 1
), saidas AS (
    SELECT date_trunc('month', pago_em)::date AS mes,
           SUM(COALESCE(valor_pago, valor))   AS despesa,
           COUNT(*)                           AS qtd_despesas
      FROM despesas
     WHERE status = 'paga' AND pago_em IS NOT NULL
     GROUP BY 1
)
SELECT
    COALESCE(e.mes, s.mes)                  AS mes,
    COALESCE(e.receita, 0)                  AS receita,
    COALESCE(s.despesa, 0)                  AS despesa,
    COALESCE(e.receita, 0) - COALESCE(s.despesa, 0) AS lucro,
    COALESCE(e.qtd_os, 0)                   AS qtd_os,
    COALESCE(s.qtd_despesas, 0)             AS qtd_despesas
FROM entradas e
FULL OUTER JOIN saidas s ON s.mes = e.mes;
