-- =====================================================================
-- 010_funcionarios_vales.sql — Cadastro de funcionários e vales
--
-- Funcionário tem nome, cargo, salário base opcional. Não fazemos folha
-- completa (nada de INSS/FGTS/etc) — o objetivo é rastrear pagamentos
-- de salário e vales durante o mês, e mostrar "quanto já paguei / a
-- pagar" pro João no fim.
--
-- Vale: pagamento adiantado dado durante o mês. Fica registrado com
-- data, valor e observação. Não vira despesa avulsa (senão duplica).
-- Quando o salário for pago, a soma dos vales pendentes vira desconto.
--
-- Ligamos despesas.funcionario_id opcional pra marcar despesas do
-- tipo salário (a UI cria a despesa E marca os vales como quitados
-- na mesma transação — mas isso é lógica de service, não schema).
-- =====================================================================

CREATE TABLE funcionarios (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome           TEXT           NOT NULL,
    cargo          TEXT,
    salario_base   NUMERIC(10,2)  CHECK (salario_base IS NULL OR salario_base >= 0),
    telefone       TEXT           CHECK (telefone IS NULL OR telefone ~ '^\+[1-9][0-9]{7,14}$'),
    observacoes    TEXT,
    ativo          BOOLEAN        NOT NULL DEFAULT TRUE,
    criado_em      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_funcionarios_nome_unico ON funcionarios (lower(nome)) WHERE ativo;
CREATE INDEX idx_funcionarios_ativo ON funcionarios (ativo);

CREATE TRIGGER t_funcionarios_upd BEFORE UPDATE ON funcionarios
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

-- Vales dados durante o mês (adiantamento). Ficam pendentes até o
-- pagamento do salário quitá-los (via quitado_em preenchido).
CREATE TABLE vales (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id UUID           NOT NULL REFERENCES funcionarios(id) ON DELETE RESTRICT,
    valor          NUMERIC(10,2)  NOT NULL CHECK (valor > 0),
    data_vale      DATE           NOT NULL DEFAULT CURRENT_DATE,
    observacoes    TEXT,
    -- Quando o salário é pago, a UI marca todos os vales pendentes
    -- do funcionário como quitados apontando pra despesa criada.
    quitado_em     TIMESTAMPTZ,
    quitado_por_despesa UUID      REFERENCES despesas(id) ON DELETE SET NULL,
    criado_por     UUID           REFERENCES users(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_vales_funcionario ON vales (funcionario_id);
CREATE INDEX idx_vales_pendentes ON vales (funcionario_id) WHERE quitado_em IS NULL;

-- Despesa pode ser vinculada a um funcionário (útil pra pagamento de
-- salário). Retrocompat: nulo pra despesas antigas.
ALTER TABLE despesas
    ADD COLUMN funcionario_id UUID REFERENCES funcionarios(id) ON DELETE SET NULL;

CREATE INDEX idx_despesas_funcionario ON despesas (funcionario_id);
