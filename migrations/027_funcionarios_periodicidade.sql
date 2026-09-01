-- =====================================================================
-- 027_funcionarios_periodicidade.sql — Frequência de pagamento
--
-- Antes o sistema assumia pagamento MENSAL. Agora cada funcionário
-- pode ter salário pago em ciclo semanal (7 dias), quinzenal (15
-- dias) ou mensal. O ciclo alimenta a UI de vales e o total a pagar
-- na ficha.
--
-- Default = mensal pra não quebrar quem já cadastrou funcionários.
-- =====================================================================

CREATE TYPE periodicidade_salario AS ENUM ('semanal', 'quinzenal', 'mensal');

ALTER TABLE funcionarios
    ADD COLUMN periodicidade periodicidade_salario NOT NULL DEFAULT 'mensal';

COMMENT ON COLUMN funcionarios.periodicidade IS
    'Frequência do pagamento do salário: semanal (7d), quinzenal (15d) ou mensal.';
