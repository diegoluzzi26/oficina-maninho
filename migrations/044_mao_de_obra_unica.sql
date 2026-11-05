-- =====================================================================
-- 044_mao_de_obra_unica.sql — Na Maninho, todo serviço do catálogo com
-- "mão de obra" no nome ("Mão de obra troca de óleo", "mao de obra -
-- elétrica"...) vira um só: "Mão de Obra". Pedido do dono (2026-11-05):
-- o catálogo de serviços fica só com serviços de verdade.
--
-- Como:
--   - o serviço principal é o que já se chama exatamente "mão de obra"; sem
--     ele, o mais usado nas OS, renomeado pra "Mão de Obra";
--   - OS, agendamentos e retornos que apontavam pras outras passam a
--     apontar pra principal (o texto lançado em cada OS NÃO muda);
--   - as outras são desativadas (somem do catálogo e das sugestões);
--   - regras de follow-up ficam como estão (amarradas no serviço antigo).
--
-- Só no schema oficina_maninho: é limpeza de dado dessa oficina.
-- Reversível: tudo que mudou fica em public._backup_044 (fora do schema da
-- oficina pra não ser copiado pra oficinas novas) e o
-- bloco comentado no fim desfaz.
-- =====================================================================

DO $$
DECLARE
  principal UUID;
  outras UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'oficina_maninho' AND table_name = 'servicos') THEN
    RETURN;
  END IF;

  -- O gatilho que recalcula o total da OS (trg_recalc_os_totais) usa
  -- nomes sem schema: sem isto, mexer em os_servicos falha.
  PERFORM set_config('search_path', 'oficina_maninho, public', true);

  CREATE TABLE IF NOT EXISTS public._backup_044 (
    tabela      TEXT NOT NULL,
    linha_id    UUID NOT NULL,
    servico_id  UUID,
    nome        TEXT,
    ativo       BOOLEAN
  );

  CREATE TEMP TABLE mo ON COMMIT DROP AS
    SELECT s.id, s.nome,
           lower(btrim(s.nome)) IN ('mão de obra', 'mao de obra') AS exato,
           (SELECT count(*) FROM oficina_maninho.os_servicos o WHERE o.servico_id = s.id) AS usos
      FROM oficina_maninho.servicos s
     WHERE s.ativo
       AND lower(s.nome) ~ 'm(a|ã)o\s*-?\s*de\s*-?\s*obra';

  IF (SELECT count(*) FROM mo) = 0 THEN RETURN; END IF;

  SELECT id INTO principal FROM mo ORDER BY exato DESC, usos DESC, nome LIMIT 1;
  SELECT coalesce(array_agg(id), '{}') INTO outras FROM mo WHERE id <> principal;

  -- Guarda o estado de antes pra poder desfazer.
  INSERT INTO public._backup_044 (tabela, linha_id, servico_id, nome, ativo)
    SELECT 'servicos', s.id, NULL, s.nome, s.ativo
      FROM oficina_maninho.servicos s WHERE s.id = principal OR s.id = ANY (outras);
  INSERT INTO public._backup_044 (tabela, linha_id, servico_id)
    SELECT 'os_servicos', id, servico_id FROM oficina_maninho.os_servicos WHERE servico_id = ANY (outras);
  INSERT INTO public._backup_044 (tabela, linha_id, servico_id)
    SELECT 'agendamento_servicos', id, servico_id FROM oficina_maninho.agendamento_servicos WHERE servico_id = ANY (outras);
  INSERT INTO public._backup_044 (tabela, linha_id, servico_id)
    SELECT 'retornos', id, servico_id FROM oficina_maninho.retornos WHERE servico_id = ANY (outras);

  UPDATE oficina_maninho.os_servicos SET servico_id = principal WHERE servico_id = ANY (outras);
  UPDATE oficina_maninho.agendamento_servicos SET servico_id = principal WHERE servico_id = ANY (outras);
  UPDATE oficina_maninho.retornos SET servico_id = principal WHERE servico_id = ANY (outras);

  -- Desativa antes de renomear (índice único de nome entre os ativos).
  UPDATE oficina_maninho.servicos SET ativo = FALSE WHERE id = ANY (outras);
  UPDATE oficina_maninho.servicos SET nome = 'Mão de Obra' WHERE id = principal;
END$$;

-- =====================================================================
-- ROLLBACK (manual):
--
-- UPDATE oficina_maninho.servicos s SET nome = b.nome, ativo = b.ativo
--   FROM public._backup_044 b WHERE b.tabela = 'servicos' AND s.id = b.linha_id;
-- UPDATE oficina_maninho.os_servicos t SET servico_id = b.servico_id
--   FROM public._backup_044 b WHERE b.tabela = 'os_servicos' AND t.id = b.linha_id;
-- UPDATE oficina_maninho.agendamento_servicos t SET servico_id = b.servico_id
--   FROM public._backup_044 b WHERE b.tabela = 'agendamento_servicos' AND t.id = b.linha_id;
-- UPDATE oficina_maninho.retornos t SET servico_id = b.servico_id
--   FROM public._backup_044 b WHERE b.tabela = 'retornos' AND t.id = b.linha_id;
-- DROP TABLE public._backup_044;
-- DELETE FROM _migrations WHERE nome = '044_mao_de_obra_unica.sql';
-- =====================================================================
