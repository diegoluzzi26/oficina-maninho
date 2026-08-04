-- =====================================================================
-- 018_followup.sql — Módulo de follow-up ativo com o cliente
--
-- Complementa a tabela `retornos` (que gera avisos automáticos a partir
-- do intervalo_retorno_meses do catálogo). O follow-up trabalha em cima
-- de REGRAS configuráveis com template de mensagem, e vira uma FILA
-- pendente pro dono disparar o WhatsApp manualmente via wa.me.
--
-- Três tipos:
--   manutencao — mesmo espírito de retorno, mas amarrado a uma regra
--                que tem template e podendo ter janela diferente do
--                intervalo_retorno_meses do catálogo.
--   reativacao — clientes sumidos há N dias sem OS nenhuma.
--   promocao   — divulgação de serviço novo/sazonal (mais manual).
--
-- IDs em UUID pra manter consistência com o restante do schema.
-- =====================================================================

CREATE TYPE followup_tipo   AS ENUM ('manutencao', 'reativacao', 'promocao');
CREATE TYPE followup_status AS ENUM ('pendente', 'enviado', 'respondeu', 'converteu', 'dispensado');

-- ---------------------------------------------------------------- regras
CREATE TABLE followup_regras (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome              TEXT           NOT NULL,
    tipo              followup_tipo  NOT NULL,
    servico_id        UUID           REFERENCES servicos(id) ON DELETE SET NULL,
    intervalo_dias    INTEGER        NOT NULL DEFAULT 180
                      CHECK (intervalo_dias > 0),
    mensagem_template TEXT           NOT NULL,
    ativo             BOOLEAN        NOT NULL DEFAULT TRUE,
    criado_em         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    atualizado_em     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TRIGGER t_followup_regras_upd BEFORE UPDATE ON followup_regras
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

-- ---------------------------------------------------------------- fila
CREATE TABLE followup_fila (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id     UUID           NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    carro_id       UUID           REFERENCES carros(id) ON DELETE SET NULL,
    regra_id       UUID           REFERENCES followup_regras(id) ON DELETE SET NULL,
    os_origem_id   UUID           REFERENCES ordens_servico(id) ON DELETE SET NULL,
    tipo           followup_tipo  NOT NULL,
    mensagem       TEXT           NOT NULL,
    status         followup_status NOT NULL DEFAULT 'pendente',
    agendado_para  DATE           NOT NULL DEFAULT CURRENT_DATE,
    enviado_em     TIMESTAMPTZ,
    respondido_em  TIMESTAMPTZ,
    convertido_os_id UUID         REFERENCES ordens_servico(id) ON DELETE SET NULL,
    notas          TEXT,
    criado_por     UUID           REFERENCES users(id) ON DELETE SET NULL,
    criado_em      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_followup_fila_status    ON followup_fila (status);
CREATE INDEX idx_followup_fila_agendado  ON followup_fila (agendado_para);
CREATE INDEX idx_followup_fila_cliente   ON followup_fila (cliente_id);

-- Um follow-up pendente por combinação (cliente, carro, regra).
-- Depois de dispensar/converter, permite gerar novo.
CREATE UNIQUE INDEX idx_followup_fila_dedup ON followup_fila
    (cliente_id, COALESCE(carro_id, '00000000-0000-0000-0000-000000000000'), regra_id)
    WHERE status = 'pendente' AND regra_id IS NOT NULL;

CREATE TRIGGER t_followup_fila_upd BEFORE UPDATE ON followup_fila
    FOR EACH ROW EXECUTE FUNCTION trg_set_atualizado_em();

-- ---------------------------------------------------------------- histórico
CREATE TABLE followup_historico (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fila_id     UUID           NOT NULL REFERENCES followup_fila(id) ON DELETE CASCADE,
    acao        TEXT           NOT NULL,
    usuario_id  UUID           REFERENCES users(id) ON DELETE SET NULL,
    notas       TEXT,
    criado_em   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX idx_followup_historico_fila ON followup_historico (fila_id, criado_em DESC);

-- ---------------------------------------------------------------- view
-- Junta a fila com dados do cliente/carro/regra pra a UI consumir direto.
CREATE VIEW vw_followup_fila AS
SELECT
    f.id,
    f.tipo,
    f.status,
    f.mensagem,
    f.agendado_para,
    f.enviado_em,
    f.respondido_em,
    f.notas,
    f.criado_em,
    f.cliente_id,
    c.nome        AS cliente_nome,
    c.telefone    AS cliente_telefone,
    f.carro_id,
    ca.placa,
    ca.marca,
    ca.modelo,
    ca.ano,
    f.regra_id,
    r.nome        AS regra_nome,
    f.os_origem_id,
    o.numero_os   AS os_numero,
    f.convertido_os_id
FROM followup_fila f
JOIN clientes c        ON c.id = f.cliente_id
LEFT JOIN carros ca    ON ca.id = f.carro_id
LEFT JOIN followup_regras r ON r.id = f.regra_id
LEFT JOIN ordens_servico o  ON o.id = f.os_origem_id;

-- ---------------------------------------------------------------- seed inicial
-- Três regras prontas pra a oficina começar a usar. Diego edita depois
-- na tela de configuração se quiser mudar texto/intervalo.
INSERT INTO followup_regras (nome, tipo, intervalo_dias, mensagem_template) VALUES
('Manutenção — 6 meses após serviço', 'manutencao', 180,
 'Olá {nome_cliente}! 👋 Aqui é da Auto Elétrica Maninho.

Faz cerca de 6 meses que atendemos o seu {modelo_carro} (placa {placa}). 🔧

Que tal marcar uma revisão? A gente confere tudo pra evitar surpresa. Chama aqui que agenda rapidinho!

📍 RS-020, 1055 — Gravataí'),

('Reativação — 9 meses sem visita', 'reativacao', 270,
 'Olá {nome_cliente}! 👋

Aqui é da Auto Elétrica Maninho. Faz um tempo que não te vemos por aqui — queríamos saber se tá tudo bem com o carro! 🚗

Se precisar de qualquer coisa (elétrica, mecânica, injeção, ar-condicionado), é só chamar. A gente cuida desde 1997.

📍 RS-020, 1055 — Gravataí'),

('Promoção — Ar-condicionado', 'promocao', 365,
 'Oi {nome_cliente}! ☀️

O verão chegando e ninguém merece carro sem ar, né? Na Auto Elétrica Maninho a gente faz recarga de gás, diagnóstico de vazamento e manutenção completa.

Agenda antes que a correria comece! Responde aqui que a gente marca. 😊

📍 RS-020, 1055 — Gravataí');
