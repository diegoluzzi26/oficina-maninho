-- =====================================================================
-- 052_followup_unificado.sql — Follow-up como lugar único de contato
--
-- 1) Retornos entram no follow-up. A tabela `retornos` continua sendo a
--    agenda de revisões (o trigger da OS paga segue criando, para serviços
--    e peças com intervalo no catálogo). A automação "Revisão" puxa para a
--    fila os retornos que estão vencendo (followup_fila.retorno_id liga os
--    dois) e o status do follow-up volta para o retorno (trigger).
--
-- 2) Automações fixas. As regras ganham `chave` (revisao, pos_servico,
--    reativacao, campanha): uma regra por cartão na tela de Automações.
--    Regras extras de oficinas antigas ficam sem chave e deixam de gerar.
--    `antecedencia_dias` = quantos dias antes do vencimento a revisão entra
--    na fila (só a Revisão usa).
--
-- 3) Cliente voltou. Ao abrir OS para o cliente:
--      enviado/respondeu há até N dias → 'converteu' ligado à OS
--      revisão/reativação ainda pendente → 'dispensado' (veio antes)
--    N = configuracoes 'followup.janela_retorno_dias' (padrão 30).
--
-- Functions ficam em public e resolvem as tabelas pelo search_path da
-- oficina, igual a trg_criar_retornos_da_os.
--
-- Reversível: bloco comentado no fim.
-- =====================================================================

-- ---------------------------------------------------------------- functions
CREATE OR REPLACE FUNCTION public.trg_followup_sincroniza_retorno() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.retorno_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;
    IF NEW.status IN ('enviado', 'respondeu', 'converteu') THEN
        UPDATE retornos SET status = 'contatado', contatado_em = COALESCE(contatado_em, now())
         WHERE id = NEW.retorno_id AND status = 'pendente';
    ELSIF NEW.status = 'dispensado' THEN
        UPDATE retornos SET status = 'ignorado'
         WHERE id = NEW.retorno_id AND status = 'pendente';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_followup_cliente_voltou() RETURNS TRIGGER AS $$
DECLARE
    janela INTEGER;
BEGIN
    SELECT NULLIF(valor, '')::int INTO janela
      FROM configuracoes WHERE chave = 'followup.janela_retorno_dias';
    janela := COALESCE(janela, 30);

    WITH conv AS (
        UPDATE followup_fila
           SET status = 'converteu', convertido_os_id = NEW.id,
               respondido_em = COALESCE(respondido_em, now()), envio_iniciado_em = NULL
         WHERE cliente_id = NEW.cliente_id
           AND status IN ('enviado', 'respondeu')
           AND enviado_em >= now() - (janela || ' days')::interval
        RETURNING id
    )
    INSERT INTO followup_historico (fila_id, acao, notas)
    SELECT id, 'cliente_voltou', 'OS #' || NEW.numero_os FROM conv;

    WITH antes AS (
        UPDATE followup_fila
           SET status = 'dispensado',
               notas = COALESCE(notas || E'\n', '') || 'Cliente voltou antes do contato (OS #' || NEW.numero_os || ')'
         WHERE cliente_id = NEW.cliente_id
           AND status = 'pendente'
           AND envio_iniciado_em IS NULL
           AND tipo IN ('manutencao', 'reativacao')
        RETURNING id
    )
    INSERT INTO followup_historico (fila_id, acao, notas)
    SELECT id, 'voltou_antes', 'OS #' || NEW.numero_os FROM antes;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- por oficina
DO $$
DECLARE
  s TEXT;
BEGIN
  FOR s IN
    SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
  LOOP
    CONTINUE WHEN to_regclass(format('%I.followup_fila', s)) IS NULL;

    -- 1) fila ↔ retorno
    EXECUTE format(
      'ALTER TABLE %I.followup_fila ADD COLUMN IF NOT EXISTS retorno_id UUID
         REFERENCES %I.retornos(id) ON DELETE SET NULL', s, s);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_fila_retorno ON %I.followup_fila (retorno_id)
         WHERE retorno_id IS NOT NULL', s);

    EXECUTE format(
      'DROP TRIGGER IF EXISTS t_followup_sincroniza_retorno ON %I.followup_fila', s);
    EXECUTE format(
      'CREATE TRIGGER t_followup_sincroniza_retorno AFTER UPDATE OF status ON %I.followup_fila
         FOR EACH ROW EXECUTE FUNCTION public.trg_followup_sincroniza_retorno()', s);

    -- 2) automações fixas
    EXECUTE format('ALTER TABLE %I.followup_regras ADD COLUMN IF NOT EXISTS chave TEXT', s);
    EXECUTE format(
      'ALTER TABLE %I.followup_regras ADD COLUMN IF NOT EXISTS antecedencia_dias INTEGER NOT NULL DEFAULT 7
         CHECK (antecedencia_dias >= 0)', s);
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_regras_chave ON %I.followup_regras (chave)
         WHERE chave IS NOT NULL', s);

    -- Adota a primeira regra de cada tipo (ativa primeiro) como o cartão.
    EXECUTE format($q$
      UPDATE %1$I.followup_regras r SET chave = m.chave
        FROM (
          SELECT DISTINCT ON (tipo) id,
                 CASE tipo WHEN 'manutencao' THEN 'revisao'
                           WHEN 'avaliacao'  THEN 'pos_servico'
                           WHEN 'reativacao' THEN 'reativacao'
                           WHEN 'promocao'   THEN 'campanha' END AS chave
            FROM %1$I.followup_regras
           ORDER BY tipo, ativo DESC, criado_em
        ) m
       WHERE r.id = m.id
         AND NOT EXISTS (SELECT 1 FROM %1$I.followup_regras x WHERE x.chave = m.chave)
    $q$, s);

    -- Cartões que faltarem nascem com texto padrão (sem nome de oficina fixo).
    EXECUTE format($q$
      INSERT INTO %1$I.followup_regras (nome, tipo, chave, intervalo_dias, mensagem_template, ativo)
      SELECT v.nome, v.tipo::followup_tipo, v.chave, v.dias, v.msg, v.ativo
        FROM (VALUES
          ('Revisão', 'manutencao', 'revisao', 180,
           E'Olá {nome_cliente}! Aqui é da {oficina}.\n\nEstá chegando a hora de {servico} do seu {modelo_carro} ({placa}). Quer agendar? É só responder aqui.', TRUE),
          ('Pós-serviço', 'avaliacao', 'pos_servico', 3,
           E'Olá {nome_cliente}! Aqui é da {oficina}. Obrigado pela confiança!\n\nFicou tudo certo com o {modelo_carro}? Se puder, conta pra gente como foi o atendimento.', FALSE),
          ('Reativação', 'reativacao', 'reativacao', 270,
           E'Olá {nome_cliente}! Aqui é da {oficina}. Faz um tempo que não te vemos por aqui.\n\nSe o carro precisar de alguma coisa, é só chamar.', FALSE),
          ('Campanha', 'promocao', 'campanha', 545,
           E'Olá {nome_cliente}! Aqui é da {oficina}.\n\n', FALSE)
        ) AS v(nome, tipo, chave, dias, msg, ativo)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.followup_regras x WHERE x.chave = v.chave)
    $q$, s);

    -- 3) cliente voltou
    EXECUTE format(
      'DROP TRIGGER IF EXISTS t_followup_cliente_voltou ON %I.ordens_servico', s);
    EXECUTE format(
      'CREATE TRIGGER t_followup_cliente_voltou AFTER INSERT ON %I.ordens_servico
         FOR EACH ROW EXECUTE FUNCTION public.trg_followup_cliente_voltou()', s);

    -- View com retorno_id no fim (CREATE OR REPLACE só aceita coluna nova no fim).
    EXECUTE format($view$
      CREATE OR REPLACE VIEW %1$I.vw_followup_fila AS
      SELECT
          f.id, f.tipo, f.status, f.mensagem, f.agendado_para, f.enviado_em,
          f.respondido_em, f.notas, f.criado_em, f.cliente_id,
          c.nome AS cliente_nome, c.telefone AS cliente_telefone,
          f.carro_id, ca.placa, ca.marca, ca.modelo, ca.ano,
          f.regra_id, r.nome AS regra_nome, f.os_origem_id, o.numero_os AS os_numero,
          f.convertido_os_id, f.envio_iniciado_em, f.retorno_id
      FROM %1$I.followup_fila f
      JOIN %1$I.clientes c        ON c.id = f.cliente_id
      LEFT JOIN %1$I.carros ca    ON ca.id = f.carro_id
      LEFT JOIN %1$I.followup_regras r ON r.id = f.regra_id
      LEFT JOIN %1$I.ordens_servico o  ON o.id = f.os_origem_id
    $view$, s);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- DOWN
-- DO $$
-- DECLARE s TEXT;
-- BEGIN
--   FOR s IN SELECT nspname FROM pg_namespace WHERE nspname LIKE 'oficina\_%' ESCAPE '\'
--   LOOP
--     CONTINUE WHEN to_regclass(format('%I.followup_fila', s)) IS NULL;
--     EXECUTE format('DROP TRIGGER IF EXISTS t_followup_cliente_voltou ON %I.ordens_servico', s);
--     EXECUTE format('DROP TRIGGER IF EXISTS t_followup_sincroniza_retorno ON %I.followup_fila', s);
--     EXECUTE format('DROP VIEW IF EXISTS %I.vw_followup_fila', s);
--     EXECUTE format('ALTER TABLE %I.followup_fila DROP COLUMN IF EXISTS retorno_id', s);
--     -- Cartões criados por esta migration (não adotados de regra existente).
--     EXECUTE format($q$DELETE FROM %1$I.followup_regras
--                     WHERE chave IS NOT NULL
--                       AND NOT EXISTS (SELECT 1 FROM %1$I.followup_fila f WHERE f.regra_id = followup_regras.id)
--                       AND nome IN ('Revisão','Pós-serviço','Reativação','Campanha')$q$, s);
--     EXECUTE format('ALTER TABLE %I.followup_regras DROP COLUMN IF EXISTS chave', s);
--     EXECUTE format('ALTER TABLE %I.followup_regras DROP COLUMN IF EXISTS antecedencia_dias', s);
--     EXECUTE format($view$
--       CREATE VIEW %1$I.vw_followup_fila AS
--       SELECT f.id, f.tipo, f.status, f.mensagem, f.agendado_para, f.enviado_em,
--              f.respondido_em, f.notas, f.criado_em, f.cliente_id,
--              c.nome AS cliente_nome, c.telefone AS cliente_telefone,
--              f.carro_id, ca.placa, ca.marca, ca.modelo, ca.ano,
--              f.regra_id, r.nome AS regra_nome, f.os_origem_id, o.numero_os AS os_numero,
--              f.convertido_os_id, f.envio_iniciado_em
--         FROM %1$I.followup_fila f
--         JOIN %1$I.clientes c ON c.id = f.cliente_id
--         LEFT JOIN %1$I.carros ca ON ca.id = f.carro_id
--         LEFT JOIN %1$I.followup_regras r ON r.id = f.regra_id
--         LEFT JOIN %1$I.ordens_servico o ON o.id = f.os_origem_id
--     $view$, s);
--   END LOOP;
-- END $$;
-- DROP FUNCTION IF EXISTS public.trg_followup_cliente_voltou();
-- DROP FUNCTION IF EXISTS public.trg_followup_sincroniza_retorno();
