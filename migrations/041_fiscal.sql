-- =====================================================================
-- 041_fiscal.sql — Estrutura da nota fiscal (NFS-e e NF-e via Focus NFe).
-- Plano completo em docs/plano-nota-fiscal.md (etapa 2).
--
-- public (metadata da plataforma):
--   oficina_fiscal       1:1 com oficinas. Dados do emitente (CNPJ,
--                        inscrições, regime, endereço estruturado), os
--                        parâmetros de emissão (código de serviço, ISS,
--                        série, NCM/CFOP padrão) e o vínculo com a Focus.
--                        Os tokens da empresa na Focus ficam CRIPTOGRAFADOS
--                        pela aplicação (colunas *_enc, chave FISCAL_ENC_KEY
--                        no .env). O certificado A1 NÃO é guardado: vai
--                        direto pra Focus; aqui fica só a validade.
--   notas_fiscais_ref    ref enviada à Focus -> oficina. O webhook da Focus
--                        não tem contexto de oficina; resolve por aqui.
--
-- Em cada oficina_<slug> (dados da oficina):
--   clientes             endereço estruturado + inscrição estadual (a NF-e
--                        exige endereço do destinatário). O `endereco`
--                        livre continua existindo.
--   pecas / os_pecas     ncm, cfop, unidade. Vazio = padrão da oficina.
--                        os_pecas guarda o valor do momento (a nota usa o
--                        que estava na OS, mesmo se o catálogo mudar).
--   notas_fiscais        uma linha por nota emitida a partir de uma OS.
--
-- Oficinas novas herdam as tabelas por clone_schema (oficina_maninho).
-- Reversível: bloco comentado no fim.
-- =====================================================================

CREATE TABLE IF NOT EXISTS oficina_fiscal (
  oficina_id                  UUID PRIMARY KEY REFERENCES oficinas(id) ON DELETE CASCADE,

  -- Emitente
  cnpj                        TEXT UNIQUE CHECK (cnpj ~ '^[0-9]{14}$'),
  razao_social                TEXT,
  nome_fantasia               TEXT,
  inscricao_municipal         TEXT,
  inscricao_estadual          TEXT,          -- número ou 'ISENTO'
  regime_tributario           TEXT CHECK (regime_tributario IN
                                ('simples_nacional', 'simples_excesso_sublimite',
                                 'regime_normal', 'mei')),
  cnae                        TEXT CHECK (cnae ~ '^[0-9]{7}$'),
  email                       TEXT,

  -- Endereço do emitente, como sai na nota
  cep                         TEXT CHECK (cep ~ '^[0-9]{8}$'),
  logradouro                  TEXT,
  numero                      TEXT,
  complemento                 TEXT,
  bairro                      TEXT,
  municipio                   TEXT,
  uf                          TEXT CHECK (uf ~ '^[A-Z]{2}$'),
  codigo_municipio            TEXT CHECK (codigo_municipio ~ '^[0-9]{7}$'),  -- IBGE

  -- NFS-e (mão de obra)
  nfse_padrao                 TEXT NOT NULL DEFAULT 'nacional'
                                CHECK (nfse_padrao IN ('nacional', 'municipal')),
  codigo_servico              TEXT,          -- item da LC 116, ex. '14.01'
  codigo_tributacao_municipal TEXT,
  aliquota_iss                NUMERIC(5,2) CHECK (aliquota_iss BETWEEN 0 AND 5),
  iss_retido                  BOOLEAN NOT NULL DEFAULT false,

  -- NF-e (peças)
  serie_nfe                   INTEGER NOT NULL DEFAULT 1 CHECK (serie_nfe > 0),
  ncm_padrao                  TEXT CHECK (ncm_padrao ~ '^[0-9]{8}$'),
  cfop_padrao                 TEXT CHECK (cfop_padrao ~ '^[0-9]{4}$'),

  -- Focus NFe
  ambiente                    TEXT NOT NULL DEFAULT 'homologacao'
                                CHECK (ambiente IN ('homologacao', 'producao')),
  focus_empresa_id            TEXT,
  focus_token_producao_enc    TEXT,
  focus_token_homologacao_enc TEXT,
  certificado_valido_ate      DATE,

  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS t_oficina_fiscal_upd ON oficina_fiscal;
CREATE TRIGGER t_oficina_fiscal_upd BEFORE UPDATE ON oficina_fiscal
  FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

CREATE TABLE IF NOT EXISTS notas_fiscais_ref (
  ref        TEXT PRIMARY KEY,
  oficina_id UUID NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = s AND table_name = 'ordens_servico'
    );

    EXECUTE format(
      'ALTER TABLE %I.clientes
         ADD COLUMN IF NOT EXISTS cep                TEXT CHECK (cep ~ ''^[0-9]{8}$''),
         ADD COLUMN IF NOT EXISTS logradouro         TEXT,
         ADD COLUMN IF NOT EXISTS numero             TEXT,
         ADD COLUMN IF NOT EXISTS complemento        TEXT,
         ADD COLUMN IF NOT EXISTS bairro             TEXT,
         ADD COLUMN IF NOT EXISTS municipio          TEXT,
         ADD COLUMN IF NOT EXISTS uf                 TEXT CHECK (uf ~ ''^[A-Z]{2}$''),
         ADD COLUMN IF NOT EXISTS codigo_municipio   TEXT CHECK (codigo_municipio ~ ''^[0-9]{7}$''),
         ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT', s);

    EXECUTE format(
      'ALTER TABLE %I.pecas
         ADD COLUMN IF NOT EXISTS ncm     TEXT CHECK (ncm ~ ''^[0-9]{8}$''),
         ADD COLUMN IF NOT EXISTS cfop    TEXT CHECK (cfop ~ ''^[0-9]{4}$''),
         ADD COLUMN IF NOT EXISTS unidade TEXT CHECK (length(unidade) BETWEEN 1 AND 6)', s);

    EXECUTE format(
      'ALTER TABLE %I.os_pecas
         ADD COLUMN IF NOT EXISTS ncm     TEXT CHECK (ncm ~ ''^[0-9]{8}$''),
         ADD COLUMN IF NOT EXISTS cfop    TEXT CHECK (cfop ~ ''^[0-9]{4}$''),
         ADD COLUMN IF NOT EXISTS unidade TEXT CHECK (length(unidade) BETWEEN 1 AND 6)', s);

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %1$I.notas_fiscais (
         id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         os_id              UUID NOT NULL REFERENCES %1$I.ordens_servico(id) ON DELETE RESTRICT,
         tipo               TEXT NOT NULL CHECK (tipo IN (''nfse'', ''nfe'')),
         ambiente           TEXT NOT NULL CHECK (ambiente IN (''homologacao'', ''producao'')),
         ref                TEXT NOT NULL UNIQUE,
         status             TEXT NOT NULL DEFAULT ''processando''
                              CHECK (status IN (''processando'', ''autorizada'', ''erro'', ''cancelada'')),
         valor              NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
         numero             TEXT,
         serie              TEXT,
         chave              TEXT,
         codigo_verificacao TEXT,
         url_pdf            TEXT,
         url_xml            TEXT,
         mensagem_erro      TEXT,
         justificativa_cancelamento TEXT,
         payload_enviado    JSONB,
         resposta           JSONB,
         emitida_por        UUID REFERENCES public.users(id) ON DELETE SET NULL,
         criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
         atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
         autorizada_em      TIMESTAMPTZ,
         cancelada_em       TIMESTAMPTZ
       )', s);

    -- Uma nota viva (processando/autorizada) por OS e tipo; erro/cancelada
    -- não bloqueiam reemitir.
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_notas_fiscais_os_tipo_viva
         ON %I.notas_fiscais (os_id, tipo) WHERE status IN (''processando'', ''autorizada'')', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_notas_fiscais_lista
         ON %I.notas_fiscais (criado_em DESC, id DESC)', s);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_notas_fiscais_processando
         ON %I.notas_fiscais (criado_em) WHERE status = ''processando''', s);

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = s AND c.relname = 'notas_fiscais' AND t.tgname = 't_notas_fiscais_upd'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER t_notas_fiscais_upd BEFORE UPDATE ON %I.notas_fiscais
           FOR EACH ROW EXECUTE FUNCTION public.trg_set_atualizado_em()', s);
    END IF;
  END LOOP;
END$$;

-- =====================================================================
-- ROLLBACK (manual):
--
-- DO $$
-- DECLARE s TEXT;
-- BEGIN
--   FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
--   LOOP
--     CONTINUE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables
--                                WHERE table_schema = s AND table_name = 'ordens_servico');
--     EXECUTE format('DROP TABLE IF EXISTS %I.notas_fiscais', s);
--     EXECUTE format('ALTER TABLE %I.os_pecas
--                       DROP COLUMN IF EXISTS ncm, DROP COLUMN IF EXISTS cfop,
--                       DROP COLUMN IF EXISTS unidade', s);
--     EXECUTE format('ALTER TABLE %I.pecas
--                       DROP COLUMN IF EXISTS ncm, DROP COLUMN IF EXISTS cfop,
--                       DROP COLUMN IF EXISTS unidade', s);
--     EXECUTE format('ALTER TABLE %I.clientes
--                       DROP COLUMN IF EXISTS cep, DROP COLUMN IF EXISTS logradouro,
--                       DROP COLUMN IF EXISTS numero, DROP COLUMN IF EXISTS complemento,
--                       DROP COLUMN IF EXISTS bairro, DROP COLUMN IF EXISTS municipio,
--                       DROP COLUMN IF EXISTS uf, DROP COLUMN IF EXISTS codigo_municipio,
--                       DROP COLUMN IF EXISTS inscricao_estadual', s);
--   END LOOP;
-- END$$;
-- DROP TABLE IF EXISTS notas_fiscais_ref;
-- DROP TABLE IF EXISTS oficina_fiscal;
-- DELETE FROM _migrations WHERE nome = '041_fiscal.sql';
-- =====================================================================
