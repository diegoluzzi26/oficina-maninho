-- =====================================================================
-- 034_contrato.sql — Contrato / Termos de uso (aceite por oficina).
--
-- `contratos` (public): versões do texto, editadas pelo super-admin. A
-- versão vigente é a de maior número. Publicar uma versão nova obriga todas
-- as oficinas a re-aceitarem.
--
-- `contrato_aceites` (public): registro de aceite por oficina+versão
-- (quem aceitou, quando, IP) — trilha de auditoria.
--
-- Enforcement (middleware exigirContrato): se a oficina não aceitou a
-- versão vigente, bloqueia as rotas de dados. Maninho (plataforma) e
-- super-admin são isentos.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

CREATE TABLE contratos (
    versao     INTEGER     PRIMARY KEY CHECK (versao > 0),
    titulo     TEXT        NOT NULL,
    texto      TEXT        NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE contrato_aceites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oficina_id  UUID        NOT NULL REFERENCES oficinas(id) ON DELETE CASCADE,
    versao      INTEGER     NOT NULL REFERENCES contratos(versao),
    usuario_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
    ip          TEXT,
    aceito_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (oficina_id, versao)
);

CREATE INDEX idx_contrato_aceites_oficina ON contrato_aceites (oficina_id, versao DESC);

-- Versão 1 — PLACEHOLDER. Troque pelo texto jurídico real pela tela da
-- Plataforma (super-admin) ou publicando uma versão nova.
INSERT INTO contratos (versao, titulo, texto) VALUES (1, 'Termos de Uso',
'TERMOS DE USO — (texto provisório, substitua pelo seu contrato)

Ao usar este sistema de gestão, a oficina concorda em:
1. Fornecer dados verídicos no cadastro.
2. Usar o sistema apenas para fins legítimos de gestão da própria oficina.
3. Manter a confidencialidade das credenciais de acesso da sua equipe.
4. Respeitar a Lei Geral de Proteção de Dados (LGPD) quanto aos dados dos
   seus clientes armazenados no sistema.

O serviço é prestado "como está". Este texto é um PLACEHOLDER e deve ser
substituído pelo contrato/termo real antes de vender a terceiros.');

-- =====================================================================
-- ROLLBACK (manual):
--   DROP TABLE IF EXISTS contrato_aceites;
--   DROP TABLE IF EXISTS contratos;
--   DELETE FROM _migrations WHERE nome = '034_contrato.sql';
-- =====================================================================
