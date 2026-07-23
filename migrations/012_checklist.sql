-- =====================================================================
-- 012_checklist.sql — Checklist de inspeção visual da OS
--
-- Baseado no papel usado hoje pela oficina: 4 seções (Internos,
-- Externos, Motor, Inferiores), cada item com 3 estados
-- (OK / Atenção / Problema) + observação por item.
--
-- Os itens são FIXOS (definidos no service) mas gravamos como texto
-- em cada linha pra sobreviver a mudanças futuras sem quebrar o
-- histórico (mesmo padrão dos serviços/peças).
-- =====================================================================

CREATE TYPE checklist_estado AS ENUM ('ok', 'atencao', 'problema');
CREATE TYPE checklist_secao  AS ENUM ('internos', 'externos', 'motor', 'inferiores');

CREATE TABLE os_checklists (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id          UUID UNIQUE NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    observacao_geral TEXT,
    finalizado_em  TIMESTAMPTZ,
    criado_por     UUID REFERENCES users(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE os_checklist_itens (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id   UUID NOT NULL REFERENCES os_checklists(id) ON DELETE CASCADE,
    secao          checklist_secao NOT NULL,
    ordem          INTEGER NOT NULL,
    nome           TEXT NOT NULL,
    estado         checklist_estado,
    observacao     TEXT,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (checklist_id, secao, ordem)
);

CREATE INDEX idx_checklist_itens_checklist ON os_checklist_itens (checklist_id);

CREATE TRIGGER t_checklist_upd BEFORE UPDATE ON os_checklists
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();
