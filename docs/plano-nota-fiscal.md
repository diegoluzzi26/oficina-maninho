# Plano — Aba de Nota Fiscal (Fase 5)

Decisões tomadas:
- Emissão real de **NFS-e** (mão de obra) e **NF-e** (peças) a partir da OS.
- Provedor: **Focus NFe**, numa **conta única do Gestão Torque** (token master).
  Cada oficina vira uma "empresa" na conta, cadastrada pela API.
- Comercial: **adicional "Fiscal"** mensal (sugestão R$ 39/mês, R$ 390/ano),
  contratável só nos planos **Profissional** e **Completo**.
- Cada oficina envia o **próprio certificado digital A1** (.pfx + senha). O
  contador dela informa regime tributário, alíquota de ISS e códigos fiscais.

## Arquitetura

```
OS fechada ──► [Emitir nota] ──► notas_fiscais (status=processando)
                                  │
                                  ▼
                 focus.service  POST /v2/nfsen?ref=… | /v2/nfe?ref=…
                                  │   (token da empresa da oficina)
                                  ▼
                 Focus ──► prefeitura / SEFAZ
                                  │
          webhook /api/webhooks/focus  (+ job de reconsulta das pendentes)
                                  │
                                  ▼
                 reconsulta GET na Focus ─► status autorizado|erro|cancelado
                                            numero, chave, PDF, XML
```

- **Roteamento do webhook**: tabela `public.notas_fiscais_ref (ref, oficina_slug)`,
  no mesmo espírito do webhook do WhatsApp roteado por instância. O webhook não
  confia no payload: usa só a `ref` e reconsulta a Focus.
- **Tokens por empresa** (produção/homologação) que a Focus devolve ficam em
  `public.oficinas`, **criptografados** com AES-256-GCM e chave
  `FISCAL_ENC_KEY` do `.env`. Nunca vão para log nem para o frontend.
- **Certificado A1**: repassado direto para a Focus e **não guardado** aqui.
  Guardamos só a validade, para avisar antes de vencer.
- **NFS-e**: padrão nacional (`/v2/nfsen`) como padrão, porque é obrigatório
  para os municípios desde 2026. Fica uma opção `nfse_padrao = 'municipal'`
  para prefeitura que ainda use o próprio sistema (`/v2/nfse`).
- **IBS/CBS (reforma tributária)**: campos passados conforme o layout da Focus,
  com valores vindos da config fiscal. Validar com o contador da Maninho.

## Variáveis de ambiente novas (`.env`)

| Variável | Uso |
|---|---|
| `FOCUS_TOKEN_MASTER` | cadastrar e atualizar empresas pela API |
| `FOCUS_AMBIENTE` | `homologacao` ou `producao` (padrão da plataforma) |
| `FOCUS_WEBHOOK_TOKEN` | segredo enviado pela Focus no header do gatilho |
| `FISCAL_ENC_KEY` | chave de 32 bytes para criptografar os tokens por empresa |

## Etapas (um commit cada)

### 1. Adicional "Fiscal" no plano e na cobrança
- `src/config/planos.js`: mapa `ADICIONAIS = { fiscal: { nome, mensal, anual, planos } }`
  e `temRecurso()` passa a considerar os adicionais contratados.
- Migration `040_adicionais.sql` em `public.oficinas`: coluna
  `adicionais TEXT[] NOT NULL DEFAULT '{}'`, com rollback.
- `asaas.service`: valor da assinatura = plano + adicionais. Ao ligar ou
  desligar o adicional, `POST /subscriptions/{id}` com o novo `value`
  (com `updatePendingPayments`).
- `Plano.jsx`: card do adicional Fiscal, com contratar e cancelar.
  Super-admin pode ligar e desligar pelo painel da plataforma.
- `exigirRecurso('fiscal')` protege todas as rotas fiscais.

### 2. Schema fiscal
Migration `041_fiscal.sql`. Para cada schema `oficina_*`, um bloco `DO` que
percorre `pg_namespace`, porque o runner roda o SQL uma vez só. Tem rollback.
- `public.oficinas`: `cnpj`, `razao_social`, `nome_fantasia`,
  `inscricao_municipal`, `inscricao_estadual`, `regime_tributario`, `cnae`,
  endereço estruturado (`cep`, `logradouro`, `numero`, `bairro`,
  `codigo_municipio` IBGE), `focus_empresa_id`, `focus_token_prod_enc`,
  `focus_token_homolog_enc`, `fiscal_ambiente`, `certificado_valido_ate`.
- Config fiscal da oficina: `nfse_padrao`, `codigo_servico` (LC 116,
  ex. 14.01), `codigo_tributacao_municipal`, `aliquota_iss`, `iss_retido`,
  `serie_nfe`, NCM e CFOP padrão das peças.
- `clientes`: endereço estruturado (`cep`, `logradouro`, `numero`, `bairro`,
  `cidade`, `uf`, `codigo_municipio`). O `endereco` livre continua existindo.
  A NF-e exige endereço do destinatário.
- `pecas` e `os_pecas`: `ncm`, `cfop`, `unidade` (padrão `UN`).
  Quando estiver vazio, usa o padrão da oficina.
- Tabela `notas_fiscais` em cada schema: `id`, `os_id`, `tipo`
  (`nfse`/`nfe`), `ref` única, `status` (`processando`, `autorizada`, `erro`,
  `cancelada`), `numero`, `serie`, `chave`, `valor`, `url_pdf`, `url_xml`,
  `mensagem_erro`, `payload_enviado` JSONB, `resposta` JSONB, `emitida_por`,
  datas (`criado_em`, `autorizada_em`, `cancelada_em`).
  Índice único parcial: só uma nota ativa por OS e tipo.
- `public.notas_fiscais_ref (ref PK, oficina_slug, criado_em)`.
- Testar a migration num dump de produção restaurado localmente
  (regra do CLAUDE.md).

### 3. Cadastro da oficina na Focus
- `src/services/focus.service.js`: cliente HTTP com Basic auth (token como
  usuário), base URL por ambiente, tratamento de rate limit, criptografia
  dos tokens. Mesmo estilo do `asaas.service.js`.
- `POST /api/fiscal/empresa`: recebe os dados fiscais e o `.pfx` + senha
  (multipart). Cria ou atualiza a empresa na Focus com o token master,
  habilita NFS-e e NF-e e guarda os tokens criptografados. Usa `dry_run=1`
  para validar antes.
- Configurações → nova aba **Fiscal**: formulário dos dados, upload do
  certificado, validade e situação ("pronto para emitir", "falta X"),
  ambiente homologação/produção.

### 4. Emissão de NFS-e a partir da OS
- `fiscal.service.montarNfse(os)`: prestador (oficina), tomador (cliente com
  CPF/CNPJ), serviços da OS (`os_servicos`), desconto proporcional, ISS.
- `POST /api/os/:id/notas { tipo: 'nfse' }`: valida pré-requisitos (OS
  fechada, cliente com CPF/CNPJ, oficina configurada), grava a nota como
  `processando` e envia para a Focus.
- Webhook `POST /api/webhooks/focus` (fora do `auth`, valida
  `FOCUS_WEBHOOK_TOKEN`), resolve a oficina pela `ref` e reconsulta a Focus.
- Job agendado (no mesmo lugar da geração diária de lembretes) que reconsulta
  notas `processando` há mais de 10 min, como rede de segurança.
- Cadastrar o gatilho da Focus pela API na primeira configuração.

### 4b. Catálogo de peças pronto pra NF-e (feito)
- Tabela NCM oficial do Siscomex em `public.ncm`, com busca e sugestão pelo
  nome da peça. NCM e CEST por peça, validados contra a tabela vigente.
- "Juntar peças parecidas" no catálogo e aviso de peça parecida na OS.
- Decisão: o NCM padrão da oficina NÃO vale como NCM automático na NF-e.
  Peça sem NCM próprio bloqueia a NF-e daquela OS.

### 5. Emissão de NF-e das peças
- `fiscal.service.montarNfe(os)`: emitente, destinatário (endereço do
  cliente), itens de `os_pecas` com NCM, CFOP e unidade, tributação conforme
  o regime (Simples: CSOSN), forma de pagamento a partir de `os_pagamentos`.
- Mesmo endpoint com `{ tipo: 'nfe' }` e o mesmo fluxo de webhook.
- Cancelamento (até 24 h, com justificativa de no mínimo 15 caracteres).
- A carta de correção fica para depois.

### 6. Aba "Notas Fiscais" e botão na OS
- `frontend/src/pages/NotasFiscais.jsx`: lista paginada (padrão
  `Paginacao.jsx`) com filtros por tipo, status e período, número, cliente,
  OS, valor, status, PDF e XML, cancelar, reemitir quando houver erro (nova
  `ref`).
- Menu e rota `/notas-fiscais`, escondidos sem o recurso `fiscal`. Sem o
  adicional, o menu mostra o convite "contrate o adicional".
- Na OS (`Ordens.jsx`): bloco "Nota fiscal" com os botões "Emitir NFS-e" e
  "Emitir NF-e", situação em tempo real (polling leve enquanto estiver
  `processando`) e o motivo da rejeição em linguagem clara.
- Permissão nova `fiscal` em `src/config/permissoes.js` (emitir e cancelar).

### 7. Homologação ponta a ponta e produção
- Criar a conta na Focus e pegar o token master. Cadastrar a Maninho em
  homologação com o A1 real dela.
- Emitir, consultar e cancelar NFS-e e NF-e em homologação. Ajustar com o
  contador as rejeições de código de serviço, ISS e CFOP.
- Virar a Maninho para produção e emitir a primeira nota real com o contador
  junto.
- Atualizar o roadmap no CLAUDE.md e o memory de planos e preços.

## O que depende de você (fora do código)
1. Criar a conta na Focus NFe (30 dias de teste) e pôr `FOCUS_TOKEN_MASTER`
   no `.env`.
2. Certificado A1 da Maninho (.pfx + senha) para a homologação.
3. Com o contador da Maninho: regime tributário, código de serviço municipal,
   alíquota de ISS, CFOP e NCM das peças mais comuns, e se as peças para
   pessoa física saem em NF-e ou NFC-e no RS.
4. Confirmar o preço do adicional (sugestão R$ 39/mês).

## Fora do escopo agora
- NFC-e (cupom de balcão). Dá para somar depois no mesmo `focus.service`.
- Importar notas de compra (entrada de peças).
- Carta de correção e inutilização de numeração.
