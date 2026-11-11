-- =====================================================================
-- 051_followup_envio_iniciado.sql
--
-- Bug do "Enviar pendentes": cada mensagem esperava a Evolution responder
-- em 15s. Quando a Evolution demorava, a mensagem SAÍA pelo WhatsApp mas o
-- item ficava 'pendente' — e um novo clique reenviava para o cliente.
--
-- `envio_iniciado_em` marca que o sistema já entregou o item à Evolution.
-- Enquanto estiver preenchido com status 'pendente', o item está "enviando
-- / conferindo": não entra em novo envio e a reconciliação confere na
-- Evolution se a mensagem saiu (vira 'enviado') ou não (limpa a marca).
--
-- Coluna nova + view recriada com a coluna no fim (CREATE OR REPLACE).
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    IF to_regclass(format('%I.followup_fila', s)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.followup_fila ADD COLUMN IF NOT EXISTS envio_iniciado_em TIMESTAMPTZ', s);

      EXECUTE format($view$
        CREATE OR REPLACE VIEW %1$I.vw_followup_fila AS
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
            f.convertido_os_id,
            f.envio_iniciado_em
        FROM %1$I.followup_fila f
        JOIN %1$I.clientes c        ON c.id = f.cliente_id
        LEFT JOIN %1$I.carros ca    ON ca.id = f.carro_id
        LEFT JOIN %1$I.followup_regras r ON r.id = f.regra_id
        LEFT JOIN %1$I.ordens_servico o  ON o.id = f.os_origem_id
      $view$, s);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- DOWN
-- DO $$
-- DECLARE s TEXT;
-- BEGIN
--   FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
--   LOOP
--     IF to_regclass(format('%I.followup_fila', s)) IS NOT NULL THEN
--       EXECUTE format('DROP VIEW IF EXISTS %I.vw_followup_fila', s);
--       EXECUTE format('ALTER TABLE %I.followup_fila DROP COLUMN IF EXISTS envio_iniciado_em', s);
--       EXECUTE format($view$
--         CREATE VIEW %1$I.vw_followup_fila AS
--         SELECT f.id, f.tipo, f.status, f.mensagem, f.agendado_para, f.enviado_em,
--                f.respondido_em, f.notas, f.criado_em, f.cliente_id,
--                c.nome AS cliente_nome, c.telefone AS cliente_telefone,
--                f.carro_id, ca.placa, ca.marca, ca.modelo, ca.ano,
--                f.regra_id, r.nome AS regra_nome, f.os_origem_id,
--                o.numero_os AS os_numero, f.convertido_os_id
--           FROM %1$I.followup_fila f
--           JOIN %1$I.clientes c ON c.id = f.cliente_id
--           LEFT JOIN %1$I.carros ca ON ca.id = f.carro_id
--           LEFT JOIN %1$I.followup_regras r ON r.id = f.regra_id
--           LEFT JOIN %1$I.ordens_servico o ON o.id = f.os_origem_id
--       $view$, s);
--     END IF;
--   END LOOP;
-- END $$;
