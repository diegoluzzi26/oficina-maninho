-- =====================================================================
-- 031_clone_schema.sql — Função pra clonar a ESTRUTURA de um schema de
-- oficina (sem dados). Base do provisionamento de oficinas novas
-- (Fase 2 citada na 026/029): cria oficina_<slug> a partir de
-- oficina_maninho, que já tem todas as migrations aplicadas.
--
-- Copia, do schema origem pro destino:
--   1) Tabelas — via CREATE TABLE LIKE INCLUDING ALL (colunas, defaults,
--      PK/unique/check/not null, índices, generated, comments). NÃO copia
--      foreign keys nem triggers (daí os passos 2 e 4).
--   2) Foreign keys — reescrevendo refs do schema origem pro destino.
--      Refs a public.users (criado_por etc) permanecem apontando pro public.
--   3) Views — pg_get_viewdef, reescrevendo o schema; com retry pra
--      resolver dependência view→view.
--   4) Triggers — pg_get_triggerdef, reescrevendo o schema da tabela.
--      As FUNCTIONS de trigger vivem no public (compartilhadas) e não mudam.
--
-- Este banco NÃO usa sequences/SERIAL (PKs são UUID gen_random_uuid()),
-- então não há sequences a clonar.
--
-- IMPORTANTE: a função fixa search_path = public (SET LOCAL) pra que
-- pg_get_*def QUALIFIQUEM os objetos do schema origem — é isso que permite
-- o replace origem→destino funcionar de forma confiável.
--
-- Reversível: DROP FUNCTION no fim (comentado).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.clone_schema(origem text, destino text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r         record;
  def       text;
  pendentes text[];
  prox      text[];
  nome_view text;
  tentativas int;
BEGIN
  IF origem = destino THEN
    RAISE EXCEPTION 'clone_schema: origem e destino iguais (%)', origem;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = origem) THEN
    RAISE EXCEPTION 'clone_schema: schema de origem % não existe', origem;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = destino) THEN
    RAISE EXCEPTION 'clone_schema: schema de destino % já existe', destino;
  END IF;

  -- Força qualificação dos objetos do schema origem nas defs geradas.
  SET LOCAL search_path = public;

  EXECUTE format('CREATE SCHEMA %I', destino);

  -- 1) Tabelas (estrutura, sem dados).
  FOR r IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = origem AND c.relkind = 'r'
     ORDER BY c.relname
  LOOP
    EXECUTE format('CREATE TABLE %I.%I (LIKE %I.%I INCLUDING ALL)',
                   destino, r.relname, origem, r.relname);
  END LOOP;

  -- 2) Foreign keys.
  FOR r IN
    SELECT cl.relname AS tbl, con.conname AS nome,
           pg_get_constraintdef(con.oid) AS cdef
      FROM pg_constraint con
      JOIN pg_class cl    ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = origem AND con.contype = 'f'
  LOOP
    def := replace(r.cdef, quote_ident(origem) || '.', quote_ident(destino) || '.');
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
                   destino, r.tbl, r.nome, def);
  END LOOP;

  -- 3) Views (com retry pra ordem de dependência view→view).
  SELECT array_agg(c.relname ORDER BY c.relname) INTO pendentes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = origem AND c.relkind = 'v';

  tentativas := 0;
  WHILE pendentes IS NOT NULL AND array_length(pendentes, 1) > 0 LOOP
    tentativas := tentativas + 1;
    IF tentativas > 10 THEN
      RAISE EXCEPTION 'clone_schema: não resolveu dependências de views: %', pendentes;
    END IF;
    prox := ARRAY[]::text[];
    FOREACH nome_view IN ARRAY pendentes LOOP
      def := replace(
        pg_get_viewdef(format('%I.%I', origem, nome_view)::regclass, true),
        quote_ident(origem) || '.', quote_ident(destino) || '.');
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s', destino, nome_view, def);
      EXCEPTION WHEN undefined_table OR undefined_object THEN
        -- Depende de outra view ainda não criada: tenta na próxima rodada.
        prox := array_append(prox, nome_view);
      END;
    END LOOP;
    EXIT WHEN array_length(prox, 1) = array_length(pendentes, 1); -- sem progresso
    pendentes := prox;
  END LOOP;

  -- 4) Triggers (reescreve o schema da tabela; function fica no public).
  FOR r IN
    SELECT t.tgname, pg_get_triggerdef(t.oid) AS tdef
      FROM pg_trigger t
      JOIN pg_class cl    ON cl.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = origem AND NOT t.tgisinternal
  LOOP
    def := replace(r.tdef, quote_ident(origem) || '.', quote_ident(destino) || '.');
    EXECUTE def;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.clone_schema(text, text) IS
  'Clona a ESTRUTURA (sem dados) de um schema de oficina para outro. '
  'Usado no provisionamento de oficinas novas a partir de oficina_maninho.';

-- =====================================================================
-- ROLLBACK (manual):
--   DROP FUNCTION IF EXISTS public.clone_schema(text, text);
--   DELETE FROM _migrations WHERE nome = '031_clone_schema.sql';
-- =====================================================================
