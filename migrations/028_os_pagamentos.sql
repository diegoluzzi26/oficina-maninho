-- =====================================================================
-- 028_os_pagamentos.sql — Pagamento da OS dividido em várias formas
--
-- Antes a OS guardava UMA forma_pagamento + valor_pago. Agora o cliente
-- pode fechar pagando parte no PIX e parte no cartão, por exemplo. Cada
-- parcela vira uma linha em `os_pagamentos` (forma + valor).
--
-- Compatibilidade: as colunas ordens_servico.forma_pagamento e
-- .valor_pago continuam preenchidas — forma_pagamento recebe a forma de
-- MAIOR valor (a "principal") e valor_pago a soma. Assim relatórios e
-- telas antigos seguem funcionando; quem quiser o detalhe lê a tabela.
--
-- A tabela vive dentro de cada schema `oficina_<slug>` (desde a 026), e o
-- ENUM forma_pagamento mora no `public` (compartilhado). Criamos a tabela
-- em cada schema existente. Oficinas novas (Fase 2) clonam oficina_maninho,
-- que já terá a tabela.
--
-- Reversível: DROP TABLE %I.os_pagamentos em cada schema oficina_*.
-- =====================================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'ordens_servico'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'os_pagamentos'
    ) THEN
      EXECUTE format(
        'CREATE TABLE %1$I.os_pagamentos (
           id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           os_id     UUID NOT NULL REFERENCES %1$I.ordens_servico(id) ON DELETE CASCADE,
           forma     public.forma_pagamento NOT NULL,
           valor     NUMERIC(12,2) NOT NULL CHECK (valor > 0),
           criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
         )', s
      );
      EXECUTE format(
        'CREATE INDEX idx_os_pagamentos_os ON %I.os_pagamentos (os_id)', s
      );
      EXECUTE format(
        'COMMENT ON TABLE %I.os_pagamentos IS %L', s,
        'Formas de pagamento usadas no fechamento da OS (split). Soma = valor_pago.'
      );
    END IF;
  END LOOP;
END$$;
