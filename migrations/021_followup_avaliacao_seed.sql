-- =====================================================================
-- 021_followup_avaliacao_seed.sql — Regra pronta pedindo review Google
-- =====================================================================

INSERT INTO followup_regras (nome, tipo, intervalo_dias, mensagem_template)
VALUES (
  'Avaliação Google — 4 dias após atendimento',
  'avaliacao',
  4,
  'Olá {nome_cliente}! 👋

Aqui é da Auto Elétrica Maninho. Passamos pra saber se ficou tudo certo no atendimento do seu {modelo_carro}. 🚗

Se puder nos ajudar com uma avaliação rápida no Google, a gente agradece MUITO — isso ajuda outros motoristas a nos encontrarem. ⭐⭐⭐⭐⭐

👉 https://g.page/r/AutoEletricaManinho/review

Qualquer coisa é só chamar. Obrigado! 🙏'
);
