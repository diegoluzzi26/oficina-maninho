# CLAUDE.md

Produto: sistema de gestão de oficina (Node + Express, PostgreSQL, React + Tailwind,
Docker Compose) virando SaaS multi-empresa para vender a outras oficinas.

## Regras válidas para qualquer tarefa neste repositório

- Toda tabela de dados tem `oficina_id` e toda query filtra por ele.
- O frontend nunca envia `oficina_id`; o valor vem sempre do JWT.
- Segredos só no `.env`, nunca em código, log ou commit.
- Migration sempre reversível e testada num dump de produção restaurado localmente.
- Nunca rodar migration ou script contra o banco de produção.
- Um commit por etapa, sem refatoração fora do escopo.

## Roadmap

Marque o status ao concluir cada fase.

1. [x] Multi-empresa e paginação das listas. (tenancy schema-por-oficina + gestão de usuários por oficina + editar oficina; paginação nas listas principais — Clientes, Ordens, Despesas)
2. [x] Lembrete automático de revisão via WhatsApp. (geração diária da fila é automática; o envio do WhatsApp segue manual, com revisão no Kanban)
3. [x] Cada oficina com o próprio número de WhatsApp. (config por oficina, instância = slug, webhook roteado por instância; no deploy, reconectar o QR da Maninho na instância 'maninho')
4. [ ] Assinatura, onboarding e contrato.
