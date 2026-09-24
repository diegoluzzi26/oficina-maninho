# Testes

Runner nativo do Node (`node --test`), sem dependências extras.

## Testes de isolamento multi-oficina (`isolamento.test.js`)

Provam que uma oficina **não** acessa dados de outra — por id direto na URL,
listagens, financeiro, anexos, histórico de WhatsApp e relatórios.

O sistema isola oficinas por **schema** (`oficina_<slug>`, ver
`src/config/db.js`). A suíte clona o schema-modelo `oficina_maninho` em dois
schemas descartáveis (`oficina_ta`, `oficina_tb`), semeia um registro de cada
tipo em cada um e verifica o isolamento pela API real.

### Pré-requisitos

A suíte **cria e dropa schemas** e exige um banco de **teste** — nunca dev/produção.
A guarda recusa rodar se o nome do banco não contiver `test`.

O fluxo esperado (mesmo do CLAUDE.md: dump de produção restaurado localmente):

```bash
# 1. Suba um Postgres e crie um banco de teste
docker compose up -d db
docker compose exec db psql -U oficina -c "CREATE DATABASE oficina_test;"

# 2. (Opcional) restaure um dump de produção nele, OU apenas rode as migrations.
#    O importante é o schema-modelo oficina_maninho existir.
DATABASE_URL="postgres://oficina:SENHA@localhost:5432/oficina_test" npm run migrate

# 3. Rode os testes apontando TEST_DATABASE_URL pro banco de teste
TEST_DATABASE_URL="postgres://oficina:SENHA@localhost:5432/oficina_test" npm test
```

No Windows (PowerShell):

```powershell
$env:TEST_DATABASE_URL="postgres://oficina:SENHA@localhost:5432/oficina_test"; npm test
```

`JWT_SECRET` é lido do `.env` (via dotenv), como no app.

### Notas

- Os schemas `oficina_ta`/`oficina_tb` e os usuários/oficinas de teste são
  removidos no fim (e recriados a cada run) — a suíte é idempotente.
- Nenhum dado real é tocado: só o schema-modelo `oficina_maninho` é lido
  (estrutura), nunca escrito.
