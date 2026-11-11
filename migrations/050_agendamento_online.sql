-- =====================================================================
-- 050_agendamento_online.sql — Origem do agendamento (interno x online)
--
-- O cliente final pode marcar horário sozinho pela página pública
-- /agendar/<slug> (link que a oficina coloca no Perfil da Empresa no
-- Google). Esses agendamentos entram com origem 'online' pra Agenda
-- destacar e o atendente conferir.
--
-- Roda em todo schema oficina_*; oficinas novas herdam pelo clone da
-- oficina_maninho. A view ganha a coluna no FIM (CREATE OR REPLACE só
-- aceita coluna nova no final).
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
    IF to_regclass(format('%I.agendamentos', s)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.agendamentos
         ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT ''interno''
           CHECK (origem IN (''interno'', ''online''))', s);

    EXECUTE format($view$
      CREATE OR REPLACE VIEW %1$I.vw_agendamentos AS
      SELECT
          a.id,
          a.cliente_id,
          c.nome        AS cliente_nome,
          c.telefone    AS cliente_telefone,
          a.carro_id,
          ca.placa,
          ca.marca,
          ca.modelo,
          a.data_agendada,
          a.duracao_min,
          a.observacoes,
          a.status,
          a.os_id,
          o.numero_os,
          a.criado_em,
          a.atualizado_em,
          (SELECT count(*) FROM %1$I.agendamento_servicos
            WHERE agendamento_id = a.id)::int AS qtd_servicos,
          a.origem
      FROM %1$I.agendamentos a
      JOIN %1$I.clientes c        ON c.id  = a.cliente_id
      JOIN %1$I.carros ca         ON ca.id = a.carro_id
      LEFT JOIN %1$I.ordens_servico o ON o.id = a.os_id
    $view$, s);
  END LOOP;
END$$;

-- =====================================================================
-- ROLLBACK (rodar manualmente):
--
-- DO $$
-- DECLARE s TEXT;
-- BEGIN
--   FOR s IN SELECT nspname FROM pg_namespace
--             WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
--   LOOP
--     IF to_regclass(format('%I.agendamentos', s)) IS NULL THEN CONTINUE; END IF;
--     EXECUTE format('DROP VIEW IF EXISTS %I.vw_agendamentos', s);
--     EXECUTE format($v$
--       CREATE VIEW %1$I.vw_agendamentos AS
--       SELECT a.id, a.cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
--              a.carro_id, ca.placa, ca.marca, ca.modelo, a.data_agendada, a.duracao_min,
--              a.observacoes, a.status, a.os_id, o.numero_os, a.criado_em, a.atualizado_em,
--              (SELECT count(*) FROM %1$I.agendamento_servicos
--                WHERE agendamento_id = a.id)::int AS qtd_servicos
--       FROM %1$I.agendamentos a
--       JOIN %1$I.clientes c ON c.id = a.cliente_id
--       JOIN %1$I.carros ca ON ca.id = a.carro_id
--       LEFT JOIN %1$I.ordens_servico o ON o.id = a.os_id
--     $v$, s);
--     EXECUTE format('ALTER TABLE %I.agendamentos DROP COLUMN IF EXISTS origem', s);
--   END LOOP;
-- END$$;
-- DELETE FROM _migrations WHERE nome = '050_agendamento_online.sql';
-- =====================================================================
