-- ---------------------------------------------------------------------
-- 024_retorno_observacao.sql
--
-- Campo livre `observacao` no retorno (separado do `motivo`, que descreve
-- o serviço). Usado pelo atendente para anotações do tipo "cliente pediu
-- pra ligar depois do almoço" ou "prefere WhatsApp".
-- ---------------------------------------------------------------------

ALTER TABLE retornos
    ADD COLUMN observacao TEXT;

DROP VIEW IF EXISTS vw_retornos;
CREATE VIEW vw_retornos AS
SELECT
    r.id,
    r.cliente_id,
    c.nome        AS cliente_nome,
    c.telefone    AS cliente_telefone,
    r.carro_id,
    ca.placa,
    ca.marca || ' ' || ca.modelo AS carro_descricao,
    r.os_id,
    o.numero_os,
    r.servico_id,
    COALESCE(r.nome_servico, s.nome) AS servico_nome,
    r.agendado_para,
    r.motivo,
    r.observacao,
    r.status,
    r.contatado_em,
    r.wa_message_id,
    r.criado_em,
    (r.agendado_para - CURRENT_DATE)::int AS dias_para
FROM retornos r
JOIN clientes c        ON c.id = r.cliente_id
LEFT JOIN carros ca    ON ca.id = r.carro_id
LEFT JOIN ordens_servico o ON o.id = r.os_id
LEFT JOIN servicos s   ON s.id = r.servico_id;
