-- Cria o database usado pela Evolution API pra guardar as sessões
-- do WhatsApp Web (Baileys) e mensagens. Fica no MESMO cluster
-- Postgres da oficina — banco separado só pra isolar tabelas.
--
-- Rodado automaticamente APENAS na primeira criação do volume pgdata
-- (pelo entrypoint padrão do postgres:16-alpine).
-- Se o volume já existe: criar manualmente com
--   docker compose exec db psql -U oficina -c 'CREATE DATABASE evolution;'

SELECT 'CREATE DATABASE evolution OWNER oficina'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
