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

## 6. Configurar o WhatsApp (Meta Cloud API)

### 6.1 Criar o app na Meta

1. Acesse [developers.facebook.com](https://developers.facebook.com) → **Meus apps** → **Criar app**
2. Tipo: **Empresa** (Business)
3. No painel do app, adicione o produto **WhatsApp**
4. Em **WhatsApp → Configuração da API**, anote:
   - **ID do número de telefone** → `PHONE_NUMBER_ID`
   - **ID da conta do WhatsApp Business** → `WABA_ID`

### 6.2 Gerar um token permanente

O token que aparece na tela de setup **expira em 24 horas** e serve só para teste.
Para produção:

1. [business.facebook.com](https://business.facebook.com) → **Configurações do negócio**
2. **Usuários → Usuários do sistema** → **Adicionar** (função: Admin)
3. **Adicionar ativos** → selecione seu app do WhatsApp → permissão de controle total
4. **Gerar novo token** → selecione o app → marque `whatsapp_business_messaging`
   e `whatsapp_business_management`
5. Copie o token para `WHATSAPP_TOKEN` (aparece uma única vez)

### 6.3 Definir o VERIFY_TOKEN

É uma senha que **você inventa** — não vem da Meta. Ela só serve para provar,
na hora de configurar o webhook, que a URL pertence a você. Coloque no `.env`:

```
VERIFY_TOKEN=maninho-webhook-2026
```

### 6.4 Expor o webhook

A Meta exige uma URL **pública e com HTTPS**. Em desenvolvimento, use ngrok:

```bash
npm install -g ngrok
ngrok http 3000
```

Copie a URL gerada (ex: `https://a1b2c3.ngrok-free.app`).

Na Meta: **WhatsApp → Configuração → Webhooks → Editar**

| Campo | Valor |
|---|---|
| URL de callback | `https://a1b2c3.ngrok-free.app/api/whatsapp/webhook` |
| Token de verificação | o mesmo `VERIFY_TOKEN` do `.env` |

Clique em **Verificar e salvar**. A Meta faz um GET; se o token bater, salva.

Depois, em **Gerenciar**, assine o campo **messages** — sem isso você não
recebe mensagens nem status de entrega.

Em produção, aponte um domínio próprio com HTTPS para a API no lugar do ngrok.

### 6.5 Criar os templates

Mensagem de texto livre só é permitida **dentro de 24h** após o cliente escrever
para você. Para iniciar conversa fora dessa janela, é obrigatório usar template
aprovado.

Em **WhatsApp → Modelos de mensagem → Criar modelo**:

**Template `os_aberta`** (categoria: Utilidade, idioma: Português BR)
```
Olá, {{1}}! Recebemos seu veículo aqui na Auto Elétrica Maninho.
Sua ordem de serviço nº {{2}} foi aberta para o {{3}}.
Qualquer novidade a gente avisa por aqui.
```

**Template `os_finalizada`** (categoria: Utilidade)
```
Olá, {{1}}! Seu veículo está pronto.
Ordem de serviço nº {{2}} — {{3}}.
Pode retirar no nosso horário de funcionamento.
```

A aprovação leva de minutos a algumas horas. Se você usar outros nomes,
ajuste `WHATSAPP_TEMPLATE_ABERTURA` e `WHATSAPP_TEMPLATE_FINALIZADA` no `.env`.

### 6.6 Endpoints do WhatsApp

```
GET  /api/whatsapp/webhook        # verificação da Meta (público)
POST /api/whatsapp/webhook        # eventos da Meta (público)
POST /api/whatsapp/enviar/texto        # exige janela de 24h aberta
POST /api/whatsapp/enviar/template     # funciona sempre
GET  /api/whatsapp/mensagens?telefone=+5551998887777
GET  /api/whatsapp/janela/:telefone    # consulta se a janela está aberta
```

Toda mensagem enviada e recebida fica registrada na tabela `wa_messages`, com
status de entrega atualizado pelo webhook (`sent` → `delivered` → `read`).

### 6.7 Alertas de contas a pagar

Configure seu número no `.env` para receber os avisos:

```
ALERTA_WHATSAPP=+5551999999999
ALERTA_HORA=8
```

O sistema verifica diariamente e manda **um resumo** com o que está atrasado,
vence hoje ou vence em até 3 dias. Cada conta gera no máximo um aviso por
estágio, então não há repetição.

Sem `ALERTA_WHATSAPP` configurado, os alertas continuam funcionando **dentro do
sistema**: contador vermelho no menu Despesas e aviso no topo da tela.

Para disparar manualmente (útil para testar):

```bash
curl -X POST http://localhost:8080/api/despesas/alertas/enviar \
  -H "Authorization: Bearer SEU_TOKEN"
```

Template sugerido, nome `alerta_contas`:
```
Você tem {{1}} conta(s) a pagar, totalizando {{2}}.
Confira no sistema da oficina.
```

### 6.8 Notificações automáticas

Passe `"notificar_whatsapp": true` ao criar uma OS ou ao mudar o status para
`finalizada`. O sistema tenta texto livre se a janela estiver aberta e cai para
template caso contrário.

Se o envio falhar, **a operação principal não é desfeita** — a OS é criada
normalmente e o motivo da falha vem no campo `whatsapp` da resposta:

```json
{ "numero_os": 61, "status": "aberta",
  "whatsapp": { "enviado": false, "motivo": "Janela de 24h fechada..." } }
```

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
