-- =====================================================================
-- 007_pecas.sql — Catálogo de peças
--
-- Antes deste 007 as peças na OS eram só texto livre (`descricao`).
-- Agora tem um catálogo: quando o atendente lança "Bateria 60Ah" numa
-- OS, se essa peça ainda não existe no catálogo, é criada automatica-
-- mente. Da próxima vez, ela aparece no autocomplete.
--
-- O valor cobrado continua vivendo em `os_pecas.valor_unit` (histórico
-- da OS não muda se o catálogo for reajustado depois — mesma regra
-- dos serviços em 001).
-- =====================================================================

CREATE TABLE pecas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome           TEXT           NOT NULL,
    valor_padrao   NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (valor_padrao >= 0),
    ativo          BOOLEAN        NOT NULL DEFAULT TRUE,
    criado_em      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- Nome único entre as ativas (case-insensitive) — evita "Bateria" e
-- "bateria" virarem 2 entradas
CREATE UNIQUE INDEX idx_pecas_nome_unico ON pecas (lower(nome)) WHERE ativo;

CREATE TRIGGER t_pecas_upd BEFORE UPDATE ON pecas
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

-- Peça na OS pode apontar pro catálogo (retrocompat: NULL quando o item
-- foi lançado antes desta migração ou pra peças casuais que não geram
-- catálogo — mas o service novo sempre cria).
ALTER TABLE os_pecas
    ADD COLUMN peca_id UUID REFERENCES pecas(id) ON DELETE SET NULL;

CREATE INDEX idx_os_pecas_peca ON os_pecas (peca_id);
