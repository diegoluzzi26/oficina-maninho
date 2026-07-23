-- =====================================================================
-- 011_despesas_recorrentes.sql — Templates de despesa que se repetem
--
-- Uma "recorrência" é o desenho da despesa: valor, categoria, dia do
-- mês, forma. Um job diário (executado pelo alertas.service) cria a
-- despesa concreta quando o dia chega — e não duplica se já existir
-- pra aquela competência (garantia via UNIQUE index parcial).
--
-- Todas as recorrências acompanham a data `proxima_geracao` — atualizada
-- automaticamente ao gerar. Retroativo: se estamos em julho e a
-- recorrência tá esquecida desde março, o job gera todas as pendentes.
-- =====================================================================

CREATE TABLE despesas_recorrentes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao       TEXT           NOT NULL,
    categoria_id    UUID           REFERENCES categorias_despesa(id) ON DELETE SET NULL,
    fornecedor_id   UUID           REFERENCES fornecedores(id) ON DELETE SET NULL,
    funcionario_id  UUID           REFERENCES funcionarios(id) ON DELETE SET NULL,
    valor           NUMERIC(10,2)  NOT NULL CHECK (valor > 0),
    forma           forma_pagamento NOT NULL DEFAULT 'boleto',
    escopo          despesa_escopo NOT NULL DEFAULT 'oficina',
    dia_do_mes      INTEGER        NOT NULL CHECK (dia_do_mes BETWEEN 1 AND 28),
    observacoes     TEXT,
    ativo           BOOLEAN        NOT NULL DEFAULT TRUE,
    -- Última competência gerada (mês/ano). Null = ainda não gerou nada.
    ultima_competencia DATE,
    criado_por      UUID           REFERENCES users(id) ON DELETE SET NULL,
    criado_em       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_despesas_recorrentes_ativo ON despesas_recorrentes (ativo) WHERE ativo;

CREATE TRIGGER t_despesas_recorrentes_upd BEFORE UPDATE ON despesas_recorrentes
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

-- Liga cada despesa concreta gerada à recorrência que a criou.
-- Idempotência (não duplicar geração) é garantida pelo próprio service
-- via ultima_competencia — date_trunc não é IMMUTABLE, então não dá
-- pra usar em índice único.
ALTER TABLE despesas
    ADD COLUMN recorrente_id UUID REFERENCES despesas_recorrentes(id) ON DELETE SET NULL;

CREATE INDEX idx_despesas_recorrente ON despesas (recorrente_id)
    WHERE recorrente_id IS NOT NULL;
