-- =====================================================================
-- 014_categoria_escopo.sql — Escopo em categorias de despesa
--
-- Até aqui, categorias_despesa era uma lista única compartilhada entre
-- oficina e pessoal — o select de despesa mostrava "Salários" mesmo
-- quando o usuário estava lançando despesa pessoal. Agora cada
-- categoria diz onde pode ser usada:
--
--   'oficina'  → só aparece nas telas de despesa da oficina
--   'pessoal'  → só aparece nas telas de despesa pessoal
--   'ambos'    → aparece nos dois (default das categorias já existentes)
--
-- As 10 categorias-semente ficam como 'ambos' pra preservar o
-- comportamento anterior: quem já usava "Peças e materiais" numa
-- despesa pessoal continua vendo ela lá.
-- =====================================================================

CREATE TYPE categoria_escopo AS ENUM ('oficina', 'pessoal', 'ambos');

ALTER TABLE categorias_despesa
    ADD COLUMN escopo categoria_escopo NOT NULL DEFAULT 'ambos';

CREATE INDEX idx_cat_escopo ON categorias_despesa (escopo) WHERE ativo;

-- vw_despesas passa a expor o escopo da categoria também (útil pro
-- frontend renderizar diferenciação visual sem query extra).
DROP VIEW IF EXISTS vw_despesas;
CREATE VIEW vw_despesas AS
SELECT d.*,
       f.nome  AS fornecedor_nome,
       cd.nome AS categoria_nome,
       cd.cor  AS categoria_cor,
       cd.escopo AS categoria_escopo,
       CASE
         WHEN d.status = 'paga' THEN NULL
         WHEN d.vencimento IS NULL THEN NULL
         ELSE (d.vencimento - CURRENT_DATE)::int
       END AS dias_para_vencer
  FROM despesas d
  LEFT JOIN fornecedores f       ON f.id = d.fornecedor_id
  LEFT JOIN categorias_despesa cd ON cd.id = d.categoria_id;
