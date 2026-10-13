# Deploy

Guia de deploy do sistema da Auto Elétrica Maninho. Vale pra qualquer
mudança que vá pra produção.

## Como funciona

- **Desenvolvimento** é na máquina local (Windows, `C:\Users\Diego\Desktop\sistema`).
- **Produção** é o servidor, em `/opt/oficina`, rodando via Docker Compose.
- O servidor é **só alvo de deploy**: ele apenas *recebe* o código com `git pull`.
  Todo commit nasce no local e sobe pro GitHub
  (`github.com/diegoluzzi26/oficina-maninho`, branch `main`).

Containers (ver `docker-compose.yml` + `docker-compose.prod.yml`):

| Serviço     | Papel |
|-------------|-------|
| `db`        | PostgreSQL (dados do sistema + banco `evolution`) |
| `api`       | Backend Express. **Roda as migrations no entrypoint.** |
| `web`       | Frontend React buildado e servido por nginx |
| `evolution` | WhatsApp (Evolution API). O `api` fala com ele em `http://evolution:8080` |
| `backup`    | Rotina de backup |
| `caddy`     | Proxy reverso + HTTPS (domínio em `DOMINIO` no `.env`) |

> O frontend é buildado **dentro** do container `web` (`npm run build` no
> Dockerfile). O `dist/` versionado é só conveniência — o `--build`
> regenera. Por isso o indicador de versão usa `package.json` + data do
> build (ver mais abaixo), e **não** o SHA do git (o `.git` não entra no
> contexto de build do Docker).

## Deploy normal

### 1. No local — commitar e enviar

```bash
git add -A && git commit -m "mensagem" && git push origin main
```

Se mudou o frontend, rebuilde o `dist/` antes de commitar pra manter o
versionado em dia:

```bash
cd frontend && npm run build && cd ..
```

### 2. No servidor — puxar e subir

```bash
cd /opt/oficina && git pull && docker compose -f docker-compose.prod.yml up -d --build
```

**Sempre a stack inteira — nunca nomeie um serviço só.**
`up -d --build web` sobe apenas o `web` e as dependências dele; como nada
depende do `evolution`, ele **não sobe junto** e o WhatsApp cai (ver
troubleshooting). O `up -d --build` sem nome reconstrói só o que mudou e
garante que **todos** os containers fiquem de pé.

### 3. Conferir que a versão nova subiu

Abre o sistema, dá **Ctrl+Shift+R** (hard refresh, pra furar o cache do
navegador) e olha o rodapé da barra lateral:

```
v1.1.0 · 13/10/26
```

A **data** é a do build e muda a cada deploy. Se bater com hoje, a versão
nova está no ar. (Passa o mouse em cima pra ver data e hora completas.)
O número da versão vem de `frontend/package.json` — suba ele a cada
release com significado.

## Regras

- **Nunca commitar no servidor.** Se o `git` do servidor reclamar de
  identidade (`Author identity unknown`), você está tentando commitar no
  lugar errado. Commit é sempre no local.
- Se a árvore do servidor estiver suja (um `git add`/edição acidental) e o
  `git pull` reclamar, alinhe com o GitHub descartando o que está lá —
  o servidor não deve ter mudança própria:
  ```bash
  cd /opt/oficina && git fetch origin && git reset --hard origin/main
  ```
  > `reset --hard` descarta alterações locais do servidor. Só rode num
  > servidor que é alvo de deploy (é o caso aqui).
- **Nunca rodar migration ou script manual contra o banco de produção.**
  As migrations rodam sozinhas no entrypoint do `api` a cada deploy.
- Segredos ficam só no `.env` do servidor (fora do git).

## Troubleshooting

### WhatsApp: "Erro interno do servidor" em Configurações

Sintoma nos logs do `api`:

```
Error: getaddrinfo EAI_AGAIN evolution
TypeError: fetch failed → GET /api/whatsapp/conexao 500
```

Causa: o container `evolution` não está de pé, então o `api` não resolve o
host `evolution`. Quase sempre é consequência de ter subido só um serviço
no deploy.

Correção:

```bash
cd /opt/oficina && docker compose -f docker-compose.prod.yml up -d
cd /opt/oficina && docker compose -f docker-compose.prod.yml ps
```

O `oficina-evolution` tem que aparecer `Up`. Se a sessão do WhatsApp já
estava pareada, reconecta sozinha; senão, leia o QR de novo na tela de
Configurações.

> A partir da versão com o fix `fix(whatsapp): tratar Evolution fora do ar
> como 503`, essa situação aparece como mensagem amigável em vez de 500.

### Ver o estado e os logs

```bash
cd /opt/oficina && docker compose -f docker-compose.prod.yml ps
cd /opt/oficina && docker compose -f docker-compose.prod.yml logs --tail=50 api
cd /opt/oficina && docker compose -f docker-compose.prod.yml logs --tail=50 evolution
```

### Mudança no frontend não aparece

É cache do navegador. **Ctrl+Shift+R**. Se ainda assim não mudar, confirme
pelo rodapé da sidebar se a data do build é a do deploy; se for antiga, o
`--build` não rodou ou o `git pull` não trouxe o commit.
