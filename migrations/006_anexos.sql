-- =====================================================================
-- 006_anexos.sql — Fotos anexadas à OS
--
-- Guarda só a METADATA no banco. O bytes do arquivo mora em ./anexos/
-- no host, montado como volume no container. Backup faz tar da pasta
-- junto com o pg_dump — restauração precisa dos dois.
--
-- ON DELETE CASCADE: apagar a OS remove os registros; mas a limpeza
-- dos arquivos em disco é responsabilidade do service (raro apagar OS).
-- =====================================================================

CREATE TABLE os_anexos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_id          UUID        NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    arquivo        TEXT        NOT NULL,      -- caminho relativo (os/<os_id>/<uuid>.<ext>)
    mime           TEXT        NOT NULL,
    tamanho        INTEGER     NOT NULL CHECK (tamanho > 0),
    descricao      TEXT,                      -- opcional: "hodômetro na entrada", "peça danificada"
    criado_por     UUID        REFERENCES users(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_os_anexos_os ON os_anexos (os_id);
