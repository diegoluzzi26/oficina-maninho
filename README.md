# Sistema de Gestão — Auto Elétrica Maninho

Sistema completo para gestão de oficina: clientes, veículos, ordens de serviço,
relatórios e integração com WhatsApp (Meta Cloud API).

**Stack:** Node.js + Express · PostgreSQL 16 · React + Vite + Tailwind · Docker Compose

---

## 1. Subir tudo com Docker (recomendado)

```bash
cp .env.example .env
# Edite o .env: obrigatoriamente troque JWT_SECRET e POSTGRES_PASSWORD
openssl rand -base64 32     # use a saída como JWT_SECRET

docker compose up -d --build
```

Isso sobe três containers: banco, API e interface web. As migrations rodam
automaticamente.

Popular com dados de exemplo:

```bash
docker compose exec api node scripts/seed.js
```

Acesse: **http://localhost:8080**

## 1.5 Colocar na internet (Vercel + Oracle Cloud, R$0)

Deploy dividido em dois lugares — cada um faz o que faz de melhor:

| Parte | Onde | Custo |
|---|---|---|
| Frontend (React/Vite) | **Vercel** (CDN global, deploy automático via GitHub) | R$0 |
| Backend + Postgres + Evolution + Backup | **Oracle Cloud Always Free** (VM ARM 4vCPU, 24GB RAM) | R$0 |

**Total permanente: R$0.**

### 1.5.1 Backend na Oracle: criar a VM (~15 min, sem código)

1. Cadastro em [oracle.com/cloud/free](https://www.oracle.com/cloud/free).
   Precisa de cartão de crédito (verificação — não cobra). No painel,
   confirma que a linha diz **"Always Free"** e não trial.
2. **Compute → Instances → Create Instance**:
   - **Shape:** `VM.Standard.A1.Flex` — 4 OCPU, 24 GB memory
   - **Image:** Canonical Ubuntu 24.04 (Minimal)
   - **Networking:** aceita o VCN default
   - **SSH keys:** cola sua chave pública (ou gera com Oracle e baixa)
3. **Pegadinha nº 1:** entra em **Networking → VCNs → default →
   Security Lists → Default Security List** e adiciona 3 regras
   Ingress pra `0.0.0.0/0`:
   - TCP `80` (HTTP)
   - TCP `443` (HTTPS)
   - UDP `443` (HTTP/3)
   Sem isso, o HTTPS não sobe — o Caddy fica travado tentando pegar
   cert do Let's Encrypt.
4. Anota o **IP público** da instância (fica no card da VM).

### 1.5.2 Backend na Oracle: instalar (~10 min, roda no servidor)

```bash
# 1. SSH na VM (usuário padrão é 'ubuntu')
ssh ubuntu@<IP>

# 2. Prepara Ubuntu (Docker, firewall, swap, hardening SSH)
curl -fsSL https://raw.githubusercontent.com/diegoluzzi26/oficina-maninho/main/deploy/setup-servidor.sh | sudo bash

# 3. Clona o repo e entra
git clone https://github.com/diegoluzzi26/oficina-maninho.git
cd oficina-maninho

# 4. Gera segredos e cria .env de produção
cp .env.example .env
JWT=$(openssl rand -base64 32)
PGP=$(openssl rand -base64 24 | tr -d '/+=')
EVK=$(openssl rand -hex 24 | tr 'a-z' 'A-Z')
IP=$(curl -s https://api.ipify.org)
DOM="${IP//./-}.sslip.io"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|; \
        s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PGP|; \
        s|^EVOLUTION_API_KEY=.*|EVOLUTION_API_KEY=$EVK|; \
        s|^DATABASE_URL=.*|DATABASE_URL=postgres://oficina:$PGP@db:5432/oficina|" .env
echo "DOMINIO=$DOM" >> .env

# 5. Sobe tudo (SEM o container web — frontend vem do Vercel)
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 6. Aguarda 30s pro Caddy pegar o certificado Let's Encrypt
sleep 30 && curl -sI https://$DOM/health
```

Se o último `curl` retornou `HTTP/2 200`, o backend tá pronto.
**Anota a URL** `https://<seu-ip>.sslip.io` — vai usar na Vercel.

### 1.5.3 Frontend na Vercel (~5 min)

1. Acessa [vercel.com](https://vercel.com) → login com GitHub
2. **Add New Project** → importa o repo `oficina-maninho`
3. Vercel detecta o `vercel.json` automaticamente
   (framework `vite`, build `cd frontend && npm install && npm run build`)
4. **Environment Variables** — adiciona uma:
   - `VITE_API_URL` = `https://<seu-ip>.sslip.io/api`
5. **Deploy** — em ~1 min tá no ar em `https://oficina-maninho-<hash>.vercel.app`

**Depois** volta no servidor da Oracle pra liberar o CORS pra o
domínio Vercel que apareceu:

```bash
cd oficina-maninho
sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://oficina-maninho.vercel.app,*.vercel.app|" .env
echo "FRONTEND_URL=oficina-maninho.vercel.app" >> .env
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api caddy
```

### 1.5.4 Depois do primeiro up

1. Abre `https://oficina-maninho-*.vercel.app` no browser
2. Login com `admin@maninho.com.br` / `admin123` → **troca a senha
   imediatamente** em Configurações
3. Configurações → **Conexão do WhatsApp** → escaneia QR
4. (Opcional) Backup pro Google Drive:
   `sudo docker compose run --rm -it backup rclone config`

### 1.5.5 Domínio próprio (opcional, ~R$40/ano)

Depois de comprar `autoeletricamaninho.com.br`:

**Backend** (subdomínio api):
```bash
# Aponta api.autoeletricamaninho.com.br pro IP da VM (DNS)
sed -i "s|^DOMINIO=.*|DOMINIO=api.autoeletricamaninho.com.br|" .env
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d caddy
```

**Frontend** (raiz): no dashboard Vercel → **Settings → Domains** →
add `autoeletricamaninho.com.br`. Vercel dá as instruções DNS. Depois
atualiza `VITE_API_URL=https://api.autoeletricamaninho.com.br/api` nas
env vars da Vercel e redeployza (bota `CORS_ORIGINS` na Oracle também).

---

## 2. Rodar em desenvolvimento (sem Docker)

Requer Node 18+ e PostgreSQL 14+.

**Terminal 1 — API:**
```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL para seu Postgres local
createdb oficina
npm run migrate
npm run seed                  # opcional
npm start                     # porta 3000
```

**Terminal 2 — interface:**
```bash
cd frontend
npm install
npm run dev                   # porta 5173
```

Acesse **http://localhost:5173**. O Vite repassa as chamadas `/api` para a porta
3000 automaticamente — não é preciso configurar CORS.

### Usuários criados pelo seed

| E-mail | Senha | Papel |
|---|---|---|
| admin@maninho.com.br | admin123 | admin |
| atendente@maninho.com.br | atendente123 | atendente |

> Troque essas senhas antes de usar em produção.

---

## 3. A interface

**Painel** (tela inicial) — faturamento do período, ticket médio, comparativo com
o mês anterior e quantas ordens estão na oficina agora. Gráfico de linha do
faturamento (alternável entre mensal e semanal), ranking de serviços por receita,
comparativo de barras e lista de clientes recorrentes. Filtro de 3, 6 ou 12 meses.

**Ordens de serviço** — lista filtrável por status e busca por cliente, placa ou
número. Abrir uma ordem mostra o detalhe completo com serviços, peças, totais e
os botões de mudança de status permitidos. A abertura de ordem já traz o preço do
catálogo preenchido, mas permite alterar item a item.

**Clientes** — cadastro com telefone normalizado automaticamente para o formato
do WhatsApp. Ao abrir um cliente, aparecem seus veículos e as últimas ordens.

**Despesas** — todas as contas da oficina. Duas abas: *Todas as despesas* e
*Boletos a pagar* (as que têm vencimento). Contas atrasadas aparecem destacadas
em vermelho e num aviso no topo. O botão **Pagar** dá baixa com data e valor,
inclusive pagamento parcial.

**Fornecedores** — distribuidoras e lojas de peças, com quanto está em aberto
com cada uma. Abrir um fornecedor mostra as últimas compras dele.

**Financeiro** — análises do mês: receita × despesa × lucro em gráfico combinado,
pizza de despesas por categoria, ranking por forma de pagamento e maiores
fornecedores. Filtro de 3, 6 ou 12 meses.

**Catálogo** — serviços com valor padrão e tempo estimado. Somente administradores
podem criar ou alterar.

---

## 4. Autenticação

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@maninho.com.br","senha":"admin123"}'
```

Retorna `{ token, usuario }`. Envie em todas as chamadas seguintes:

```
Authorization: Bearer SEU_TOKEN
```

### Papéis

| Ação | admin | atendente |
|---|:--:|:--:|
| Clientes / veículos / ordens (criar, editar) | ✅ | ✅ |
| Catálogo de serviços (criar, editar preço) | ✅ | ❌ |
| Excluir cliente / veículo | ✅ | ❌ |
| Criar usuários | ✅ | ❌ |
| Relatórios | ✅ | ✅ |

---

## 5. Endpoints

### Clientes
```
GET    /api/clientes?pagina=1&por_pagina=20&busca=joão
GET    /api/clientes/:id          # inclui os carros do cliente
POST   /api/clientes
PUT    /api/clientes/:id
DELETE /api/clientes/:id          # admin
```

O telefone é normalizado automaticamente para E.164:
`(51) 99888-7777` → `+5551998887777`.

### Carros
```
GET    /api/carros?cliente_id=UUID&busca=ABC1D23
POST   /api/carros
PUT    /api/carros/:id
DELETE /api/carros/:id            # admin
```

### Serviços (catálogo)
```
GET    /api/servicos
POST   /api/servicos              # admin
PUT    /api/servicos/:id          # admin
DELETE /api/servicos/:id          # admin — desativa, não apaga
```

### Ordens de serviço
```
GET    /api/os?status=aberta&cliente_id=UUID&busca=ABC1D23
GET    /api/os/:id
POST   /api/os
PUT    /api/os/:id                       # km, observações, desconto
PATCH  /api/os/:id/status
POST   /api/os/:id/servicos
DELETE /api/os/:id/servicos/:itemId
POST   /api/os/:id/pecas
DELETE /api/os/:id/pecas/:itemId
```

Criar OS:

```json
{
  "cliente_id": "uuid",
  "carro_id": "uuid",
  "km_entrada": 150000,
  "desconto": 50,
  "servicos": [
    { "servico_id": "uuid", "quantidade": 1 },
    { "servico_id": "uuid", "quantidade": 2, "valor_unit": 99.90 }
  ],
  "pecas": [
    { "descricao": "Bateria 60Ah", "quantidade": 1, "valor_unit": 320.00 }
  ],
  "notificar_whatsapp": true
}
```

**Sobre o valor dos serviços:** se `valor_unit` for omitido, o sistema puxa o
`valor_padrao` do catálogo. Uma vez gravado, o valor pertence àquela OS —
reajustar o catálogo depois **não altera** nenhuma OS já lançada. É isso que
permite cobrar preços diferentes pelo mesmo serviço em momentos diferentes.

**Fluxo de status permitido:**

```
aberta ⇄ em_andamento → finalizada → paga
   └──────────────────────┘
```

OS `paga` é final: não pode ser reaberta nem ter itens alterados.

### Despesas e boletos
```
GET    /api/despesas?status=atrasada&busca=alternador
GET    /api/despesas/boletos          # só as que têm vencimento
GET    /api/despesas/alertas?dias=7   # a vencer + atrasadas
POST   /api/despesas
PUT    /api/despesas/:id
PATCH  /api/despesas/:id/pagar        # baixa de pagamento
DELETE /api/despesas/:id              # admin — cancela, não apaga
POST   /api/despesas/alertas/enviar   # admin — dispara aviso por WhatsApp
```

Criar despesa:

```json
{
  "descricao": "Compra de alternadores",
  "valor": 2340.00,
  "forma": "boleto",
  "vencimento": "2026-08-15",
  "categoria_id": "uuid",
  "fornecedor_id": "uuid",
  "numero_doc": "NF-4471"
}
```

**Boleto é uma despesa com `vencimento` preenchido.** Sem vencimento, a despesa
entra nas análises mas não aparece na aba Boletos nem nos alertas. Formas aceitas:
`dinheiro`, `pix`, `boleto`, `cartao_credito`, `cartao_debito`, `transferencia`,
`cheque`, `outro`.

Contas vencidas viram `atrasada` automaticamente — a verificação roda a cada
consulta, sem depender de agendador externo.

### Fornecedores
```
GET    /api/fornecedores?busca=distribuidora
GET    /api/fornecedores/:id      # inclui as últimas despesas
POST   /api/fornecedores
PUT    /api/fornecedores/:id
DELETE /api/fornecedores/:id      # admin — desativa
```

### Análises financeiras
```
GET /api/financeiro/painel?inicio=2026-01-01&fim=2026-07-31
GET /api/financeiro/fluxo-caixa    # receita × despesa × lucro por mês
GET /api/financeiro/por-categoria
GET /api/financeiro/por-forma
GET /api/financeiro/por-fornecedor
GET /api/financeiro/categorias
```

**Dois critérios de data, e a diferença importa:**

- *Competência* — a qual mês a despesa pertence. Usada nas análises por categoria
  e forma de pagamento.
- *Pagamento* (`pago_em`) — quando o dinheiro saiu. Usada no fluxo de caixa,
  para casar com o faturamento, que usa `paga_em`.

Uma compra de julho paga em agosto conta na competência de julho, mas no caixa
de agosto.

### Relatórios
```
GET /api/relatorios/dashboard?inicio=2026-01-01&fim=2026-07-31
GET /api/relatorios/resumo
GET /api/relatorios/faturamento                 # mensal
GET /api/relatorios/faturamento/semanal
GET /api/relatorios/servicos-mais-vendidos?limite=10
GET /api/relatorios/clientes-recorrentes?limite=10
GET /api/relatorios/comparativo-mensal
```

**Base de cálculo:** o faturamento considera apenas OS com status `paga`,
datada pelo campo `paga_em`. Uma OS finalizada mas não paga aparece em
"em aberto" no resumo, não na receita.

---

## 6. WhatsApp (Evolution API — self-hosted)

O sistema usa **Evolution API** — um servidor open-source (via Baileys) que
fala com o WhatsApp Web como se fosse um celular. Isso substitui a Meta
Cloud API oficial, com trade-offs:

|  | Meta Cloud (antigo) | Evolution (agora) |
|---|---|---|
| Custo | Por conversa iniciada | Só hospedagem |
| Templates | Obrigatório fora da janela de 24h | Não existe — texto livre sempre |
| Cadastro | Business Manager, CNPJ, aprovação | Só escanear QR |
| Risco de ban | Zero (oficial) | Baixo se não spammar |
| Mídia | Complicado | POST simples |

### 6.1 Sobe junto com o resto

O container `evolution` já está no `docker-compose.yml`. `docker compose up -d`
sobe API, DB, web, evolution e backup juntos. A primeira vez:

```bash
# Se o volume pgdata é novo, o database `evolution` é criado sozinho.
# Se você já rodava a app antes, cria manualmente:
docker compose exec db psql -U oficina -c 'CREATE DATABASE evolution;'
docker compose up -d evolution
```

Painel administrativo do Evolution em [http://localhost:8081/manager](http://localhost:8081/manager).
Usa a chave `EVOLUTION_API_KEY` do `.env` como login.

### 6.2 Conectar seu número (uma vez)

1. Entre no sistema como admin
2. Menu **Config** → seção **Conexão do WhatsApp**
3. Clique **Conectar WhatsApp**
4. No celular: WhatsApp → **Aparelhos conectados** → **Conectar aparelho** →
   escaneie o QR code que apareceu na tela
5. Assim que o WhatsApp confirmar, o QR some e o status vira **Conectado**

A sessão fica guardada no volume `evolution_instances` — sobrevive a
reboots. Se o celular perder a conexão (bateria, sinal), pode precisar
reconectar; se o número é removido dos aparelhos no celular, precisa
escanear de novo.

### 6.3 Quem recebe o quê

| Papel | Recebe |
|---|---|
| **Número da oficina** (conectado no Evolution) | Envia mensagens pros clientes |
| **`ALERTA_WHATSAPP`** (seu celular pessoal) | Recebe alertas internos de contas a pagar |

Como Evolution não tem template, tudo é texto livre — o próprio texto da
notificação é montado no código (não precisa aprovar nada em lugar nenhum).

### 6.4 O que dispara mensagem automaticamente

| Quando | Pra quem | Texto |
|---|---|---|
| OS criada com `notificar_whatsapp:true` | cliente | "Recebemos seu carro, OS nº X aberta…" |
| Status vira `finalizada` com notificar | cliente | "Seu carro está pronto, total R$ X…" |
| Status vira `paga` com "Enviar recibo" | cliente | "Obrigado, pagamento de R$ X recebido…" |
| Botão "WhatsApp" na aba Retornos | cliente | "Está na hora de agendar [serviço]…" |
| 1x/dia, agendamentos de amanhã | cliente | "Lembrando do seu agendamento amanhã às X…" |
| 1x/dia às `ALERTA_HORA` | dono (`ALERTA_WHATSAPP`) | Resumo de contas a pagar |

### 6.5 Endpoints da API

```
POST /api/whatsapp/webhook              (público, recebe eventos do Evolution)
POST /api/whatsapp/enviar/texto         (auth)
GET  /api/whatsapp/mensagens?telefone=+5551...
GET  /api/whatsapp/janela/:telefone     (retorna sempre true — mantido por compat)
GET  /api/whatsapp/conexao              (admin) — estado da sessão
POST /api/whatsapp/conexao/qrcode       (admin) — gera QR pra conectar
POST /api/whatsapp/conexao/desconectar  (admin) — desliga a sessão
```

### 6.6 Risco de ban do WhatsApp

Evolution usa WhatsApp Web via engenharia reversa (Baileys). O WhatsApp
não proíbe, mas pode banir números se detectar padrão de spam:

- Mandar avisos individuais pra clientes que já conhecem a oficina — normal
- Responder mensagens que chegam — normal
- Disparar centenas de mensagens iguais em minutos — arriscado
- Comprar lista de números e mandar promoção — banimento certo

Pra uma oficina que manda ~50 mensagens/dia de OS e retorno, o risco é
próximo de zero. Se for escalar pra marketing em massa, aí sim reconsiderar.

---

## 7. Erros

| HTTP | Quando |
|---|---|
| 401 | token ausente, inválido ou expirado |
| 403 | papel sem permissão para a ação |
| 404 | registro não encontrado |
| 409 | duplicidade (placa, CPF, e-mail) ou janela de 24h fechada |
| 422 | dados inválidos ou regra de negócio violada |
| 503 | WhatsApp não configurado |

Erros de validação trazem o campo exato:

```json
{ "erro": "Dados inválidos",
  "detalhes": [{ "campo": "telefone", "erro": "Telefone inválido: \"123\"..." }] }
```

---

## 8. Identidade visual

A interface usa a identidade real da oficina, extraída do logo vetorial e das
fotos da fachada:

| Elemento | Valor | Origem |
|---|---|---|
| Azul da marca | `#283090` | extraído do `Logo_Maninho.pdf` (13% dos pixels) |
| Preto do painel | `#131318` | painel da fachada |
| Dourado | `#D4A843` | filete do letreiro |
| Tipografia da marca | Parisienne | script do letreiro |
| Tipografia de títulos | Oswald | condensada, leitura de oficina |
| Texto corrido | Public Sans | legibilidade em tela |

O arco do logo aparece como marca d'água no login, como marcador diagonal nos
títulos de seção e no favicon. O selo "Desde 1997" reproduz o da fachada.

Todos os textos foram medidos e passam no contraste mínimo WCAG AA (4.5:1 para
texto normal, 3:1 para títulos) — importante para uso o dia inteiro no balcão.

Para trocar as cores, edite `frontend/tailwind.config.js`: a paleta `maninho`,
`painel` e `ouro` está centralizada lá.

## 9. Estrutura de pastas

```
migrations/         schema SQL versionado
scripts/            migrate.js e seed.js
src/                API (Express)
  config/           env validado no boot, pool do Postgres
  middleware/       auth, papéis, validação, tratamento de erros
  routes/           rotas HTTP
  services/         regra de negócio e SQL
  validators/       schemas Zod
  utils/            AppError, normalização E.164
frontend/           interface (React + Vite + Tailwind)
  src/pages/        Painel, Ordens, Clientes, Catálogo
  src/components/   Layout e componentes de UI
  src/lib/          cliente de API e formatadores pt-BR
  nginx.conf        serve os arquivos e faz proxy para a API
```

### Decisões de banco que valem saber

- **Totais da OS** ficam em colunas, recalculadas por trigger quando itens mudam.
  Relatório não precisa somar item a item, e o total nunca diverge.
- **`numero_cliente` e `numero_os`** são atribuídos por trigger, não por SEQUENCE.
  Sequences não sofrem rollback: um cadastro rejeitado por validação deixaria
  buraco na numeração que o cliente vê.
- **`nome_servico` e `valor_unit`** são copiados para a OS. O histórico fica
  correto mesmo se o serviço for renomeado, reajustado ou desativado.
- **Serviços são desativados, nunca apagados**, porque OS antigas os referenciam.

---

## 10. Limitações conhecidas

- **Sem paginação visual nas listagens.** As telas carregam até 50 registros por
  vez. Com alguns milhares de ordens, vale adicionar controles de página.
- **Não é possível editar itens de uma ordem já aberta pela interface.** A API
  suporta (`POST /api/os/:id/servicos`), mas a tela ainda não expõe.
- **Sem tela de usuários.** Criar atendentes é feito pela API (`POST /api/auth/usuarios`).
- **Sem relatório exportável.** Os dados aparecem em tela; exportar CSV/PDF
  ficaria como próximo passo.
