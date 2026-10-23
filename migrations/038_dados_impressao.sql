-- =====================================================================
-- 038_dados_impressao.sql — Endereço, telefone e especialidades de cada
-- oficina, mostrados no cabeçalho da OS e do checklist impressos.
--
-- Fica em public.oficinas junto com a identidade visual (037).
--
--   endereco        rua, número, bairro ("RS-020, 1055")
--   cidade          cidade ("Gravataí")
--   uf              sigla do estado, 2 letras maiúsculas ("RS")
--   telefone        telefone/WhatsApp de contato, texto livre
--   especialidades  linha curta ("Elétrica · Injeção · Ar-condicionado")
--
-- A Maninho já saía com endereço e especialidades fixos no código; o
-- UPDATE abaixo leva esses valores pro banco pra impressão dela não mudar.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

ALTER TABLE oficinas
  ADD COLUMN IF NOT EXISTS endereco       TEXT,
  ADD COLUMN IF NOT EXISTS cidade         TEXT,
  ADD COLUMN IF NOT EXISTS uf             TEXT
    CHECK (uf ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS telefone       TEXT,
  ADD COLUMN IF NOT EXISTS especialidades TEXT;

UPDATE oficinas
   SET endereco = 'RS-020, 1055', cidade = 'Gravataí', uf = 'RS',
       especialidades = 'Elétrica · Injeção · Ar-condicionado'
 WHERE slug = 'maninho' AND endereco IS NULL;

-- =====================================================================
-- ROLLBACK (manual):
--   ALTER TABLE oficinas
--     DROP COLUMN IF EXISTS endereco,
--     DROP COLUMN IF EXISTS cidade,
--     DROP COLUMN IF EXISTS uf,
--     DROP COLUMN IF EXISTS telefone,
--     DROP COLUMN IF EXISTS especialidades;
--   DELETE FROM _migrations WHERE nome = '038_dados_impressao.sql';
-- =====================================================================
