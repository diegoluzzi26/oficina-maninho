-- =====================================================================
-- 015_faltas.sql — Registro de faltas dos funcionários
--
-- O pagamento é toda sexta-feira. A UI mostra "faltas da semana" que
-- naturalmente zera após a sexta (pois a janela de consulta muda),
-- mas o registro individual de cada falta fica gravado pra sempre —
-- assim dá pra ver quantas faltas o funcionário teve no mês, no ano,
-- ou em qualquer período.
--
-- Semana de pagamento = sábado (após o pagamento anterior) até a
-- sexta seguinte (inclusive). O cálculo do início da semana fica
-- por conta do service (evita hardcode de calendário no schema).
-- =====================================================================

CREATE TABLE faltas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funcionario_id UUID           NOT NULL REFERENCES funcionarios(id) ON DELETE RESTRICT,
    data_falta     DATE           NOT NULL DEFAULT CURRENT_DATE,
    justificada    BOOLEAN        NOT NULL DEFAULT FALSE,
    observacoes    TEXT,
    criado_por     UUID           REFERENCES users(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Impede duplicidade de falta no mesmo dia para o mesmo funcionário.
-- Se precisar registrar meio período, use `observacoes` ou remova
-- a falta antes de recadastrar.
CREATE UNIQUE INDEX idx_faltas_unica ON faltas (funcionario_id, data_falta);
CREATE INDEX idx_faltas_funcionario_data ON faltas (funcionario_id, data_falta DESC);
