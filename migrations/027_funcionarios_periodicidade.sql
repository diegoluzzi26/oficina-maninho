-- =====================================================================
-- 027_funcionarios_periodicidade.sql — Frequência de pagamento
--
-- Antes o sistema assumia pagamento MENSAL. Agora cada funcionário
-- pode ter salário pago em ciclo semanal (7 dias), quinzenal (15
-- dias) ou mensal. O ciclo alimenta a UI de vales e o total a pagar
-- na ficha.
--
-- Default = mensal pra não quebrar quem já cadastrou funcionários.
--
-- A tabela `funcionarios` vive dentro de cada schema `oficina_<slug>`
-- desde a migration 026, então o ENUM é criado em `public` (tipos são
-- compartilhados) e a coluna é adicionada em cada schema existente.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'periodicidade_salario') THEN
    CREATE TYPE public.periodicidade_salario AS ENUM ('semanal', 'quinzenal', 'mensal');
  END IF;
END$$;

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'funcionarios'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'funcionarios' AND column_name = 'periodicidade'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.funcionarios ADD COLUMN periodicidade public.periodicidade_salario NOT NULL DEFAULT ''mensal''',
        s
      );
      EXECUTE format(
        'COMMENT ON COLUMN %I.funcionarios.periodicidade IS %L',
        s,
        'Frequência do pagamento do salário: semanal (7d), quinzenal (15d) ou mensal.'
      );
    END IF;
  END LOOP;
END$$;
