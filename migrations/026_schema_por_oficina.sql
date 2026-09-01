-- =====================================================================
-- 026_schema_por_oficina.sql — Move tabelas de dados pro schema
-- oficina_maninho (Fase 1b — DELICADA).
--
-- IMPORTANTE: rode `pg_dump` ANTES de aplicar.
--
-- Depois desta migration:
--   public.*        — só metadata do sistema:
--                       _migrations, oficinas, users
--   oficina_maninho.* — todos os dados da oficina existente
--
-- Novas oficinas: Fase 2 vai clonar oficina_maninho pra oficina_<slug>.
--
-- Backend passa a executar `SET search_path = oficina_<slug>, public`
-- por request, baseado no JWT (mudança em src/config/db.js + middleware).
--
-- FUNCTIONS/TYPES ficam no public — são compartilhados. Postgres
-- resolve nome não qualificado via search_path.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS oficina_maninho;

-- Move as tabelas de dados. Ordem não importa: FKs seguem por OID.
-- Sequências vinculadas ao tipo SERIAL/BIGSERIAL vão junto automaticamente.

ALTER TABLE clientes            SET SCHEMA oficina_maninho;
ALTER TABLE carros              SET SCHEMA oficina_maninho;
ALTER TABLE servicos            SET SCHEMA oficina_maninho;
ALTER TABLE pecas               SET SCHEMA oficina_maninho;
ALTER TABLE ordens_servico      SET SCHEMA oficina_maninho;
ALTER TABLE os_servicos         SET SCHEMA oficina_maninho;
ALTER TABLE os_pecas            SET SCHEMA oficina_maninho;
ALTER TABLE os_anexos           SET SCHEMA oficina_maninho;
ALTER TABLE os_adiantamentos    SET SCHEMA oficina_maninho;
ALTER TABLE os_checklists       SET SCHEMA oficina_maninho;
ALTER TABLE os_checklist_itens  SET SCHEMA oficina_maninho;
ALTER TABLE agendamentos        SET SCHEMA oficina_maninho;
ALTER TABLE agendamento_servicos SET SCHEMA oficina_maninho;
ALTER TABLE retornos            SET SCHEMA oficina_maninho;
ALTER TABLE wa_messages         SET SCHEMA oficina_maninho;
ALTER TABLE despesas            SET SCHEMA oficina_maninho;
ALTER TABLE categorias_despesa  SET SCHEMA oficina_maninho;
ALTER TABLE alertas_despesa     SET SCHEMA oficina_maninho;
ALTER TABLE despesas_recorrentes SET SCHEMA oficina_maninho;
ALTER TABLE fornecedores        SET SCHEMA oficina_maninho;
ALTER TABLE funcionarios        SET SCHEMA oficina_maninho;
ALTER TABLE vales               SET SCHEMA oficina_maninho;
ALTER TABLE faltas              SET SCHEMA oficina_maninho;
ALTER TABLE followup_regras     SET SCHEMA oficina_maninho;
ALTER TABLE followup_fila       SET SCHEMA oficina_maninho;
ALTER TABLE followup_historico  SET SCHEMA oficina_maninho;
ALTER TABLE configuracoes       SET SCHEMA oficina_maninho;
ALTER TABLE relatorios_enviados SET SCHEMA oficina_maninho;

-- Views seguem a mesma casa (não podem ficar referenciando cross-schema
-- sem qualificar, e queremos que a listagem mostre elas dentro da
-- oficina).
ALTER VIEW vw_faturamento    SET SCHEMA oficina_maninho;
ALTER VIEW vw_fluxo_mensal   SET SCHEMA oficina_maninho;
ALTER VIEW vw_despesas       SET SCHEMA oficina_maninho;
ALTER VIEW vw_retornos       SET SCHEMA oficina_maninho;
ALTER VIEW vw_followup_fila  SET SCHEMA oficina_maninho;

-- vw_agendamentos pode não existir se a migration original não criou;
-- protege com IF EXISTS via DO block.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views
              WHERE table_schema='public' AND table_name='vw_agendamentos') THEN
    EXECUTE 'ALTER VIEW public.vw_agendamentos SET SCHEMA oficina_maninho';
  END IF;
END$$;

-- Garante que a linha na tabela `oficinas` tem o slug 'maninho'
-- (esperado pela Fase 1a, mas confere por segurança).
UPDATE oficinas SET slug = 'maninho' WHERE nome = 'Auto Elétrica Maninho' AND slug IS NULL;
