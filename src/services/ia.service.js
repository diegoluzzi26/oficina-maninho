'use strict';
const AppError = require('../utils/AppError');

/**
 * Integração com IA generativa (Claude via Anthropic API).
 *
 * Uso atual: gerar mensagens personalizadas de WhatsApp pro cliente
 * (follow-up manual, avisos de OS, etc). O prompt é curto e específico
 * — evita respostas longas e mantém o custo por chamada baixo.
 *
 * Config no .env:
 *   ANTHROPIC_API_KEY  — obrigatória (pega em console.anthropic.com)
 *   IA_MODELO          — opcional (default: claude-haiku-4-5-20251001)
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODELO_DEFAULT = 'claude-haiku-4-5-20251001';
// Modelo pra análises mais elaboradas (parecer, diagnóstico). Sonnet é
// bem mais caro que Haiku mas dá parecer mais afiado.
const MODELO_ANALISE_DEFAULT = 'claude-sonnet-5';

function chaveOuFalha() {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    throw new AppError(
      'IA não configurada. Peça o admin pra colocar ANTHROPIC_API_KEY no .env do servidor.',
      422,
    );
  }
  return chave;
}

async function chamarClaude(prompt, { maxTokens = 400, modelo } = {}) {
  const chave = chaveOuFalha();
  const modeloFinal = modelo || process.env.IA_MODELO || MODELO_DEFAULT;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': chave,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modeloFinal,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[ia] erro Anthropic:', res.status, txt);
    throw new AppError(`IA indisponível (HTTP ${res.status})`, 502);
  }
  const data = await res.json();
  const texto = data?.content?.[0]?.text?.trim();
  if (!texto) throw new AppError('IA devolveu resposta vazia', 502);
  return texto;
}

/**
 * Redige uma mensagem de WhatsApp pra o cliente da oficina.
 * `tipo` orienta o TOM: manutencao/reativacao/promocao/avaliacao/aviso.
 * `contexto` é texto livre com detalhes que a IA deve considerar.
 */
async function redigirMensagem({ tipo, cliente_nome, veiculo, contexto }) {
  if (!cliente_nome) throw new AppError('Nome do cliente é obrigatório', 422);
  const orientacao = {
    manutencao: 'lembrar de uma manutenção preventiva. Tom amigável e prático.',
    reativacao: 'reativar cliente que sumiu — sem cobrar, só mostrar que estamos aqui.',
    promocao:   'divulgar um serviço novo ou promoção. Tom convidativo, sem exagero.',
    avaliacao:  'pedir avaliação no Google educadamente após um bom atendimento.',
    aviso:      'avisar sobre algo pontual (OS pronta, agendamento, etc). Direto ao ponto.',
    livre:      'mensagem livre baseada no contexto fornecido.',
  }[tipo] || 'mensagem livre baseada no contexto fornecido.';

  const prompt = `Você redige mensagens de WhatsApp para clientes da "Auto Elétrica Maninho" (Gravataí/RS, desde 1997).

Objetivo desta mensagem: ${orientacao}

Cliente: ${cliente_nome}${veiculo ? `\nVeículo: ${veiculo}` : ''}${contexto ? `\nContexto adicional: ${contexto}` : ''}

Escreva a mensagem em português brasileiro, tom cordial mas direto (como oficina de bairro que conhece o cliente).
- Máximo 5-6 linhas curtas
- Use no máximo 2-3 emojis, com moderação
- Sem "Olá,\\nSou o Diego, da Auto Elétrica Maninho" — vai direto ao ponto
- Termina convidando pra responder ou marcar
- Assinatura só se fizer sentido; não repita "Auto Elétrica Maninho" mais de 1 vez

Responda APENAS com o texto da mensagem, sem introdução, sem aspas, sem markdown.`;

  return chamarClaude(prompt, { maxTokens: 500 });
}

/**
 * Gera um parecer da IA sobre a saúde do negócio, baseado nos números
 * do mês atual + comparativo. `dados` é o retorno de painelMes (mesmo
 * que alimenta o dashboard). Retorna Markdown com 4 seções curtas.
 */
async function gerarParecer(dados) {
  const modelo = process.env.IA_MODELO_ANALISE || MODELO_ANALISE_DEFAULT;

  // Compacta o payload pra reduzir tokens gastos (o dashboard tem muita
  // coisa que a IA não precisa: cores de gráfico, IDs, etc).
  const resumo = {
    referencia: dados.referencia,
    receita: dados.receita,
    despesa: dados.despesa,
    lucro: dados.lucro,
    projecao_fechamento: dados.projecao_fechamento,
    dias_restantes: dados.dias_restantes,
    meta: dados.meta,
    qtd_os: dados.qtd_os,
    ticket_medio: dados.ticket_medio,
    clientes_atendidos: dados.clientes_atendidos,
    desconto_total_mes: dados.desconto_total_mes,
    em_aberto: dados.em_aberto,
    por_forma_pagto: dados.por_forma,
    top_servicos: dados.top_servicos,
    top_marcas: dados.top_marcas,
    comparativo_mes_anterior: dados.comparativo,
  };

  const prompt = `Você é consultor de gestão pra oficinas mecânicas de bairro no Brasil. Analise os números da "Auto Elétrica Maninho" (Gravataí/RS, funcionando desde 1997) e dê um parecer prático.

Dados do mês:
${JSON.stringify(resumo, null, 2)}

Responda em português brasileiro com 4 seções curtas em markdown:

## 👍 O que está indo bem
2-3 pontos positivos concretos (com número quando fizer sentido).

## ⚠️ Pontos de atenção
2-3 riscos ou tendências negativas que o dono deveria olhar.

## 💡 Sugestões práticas
2-3 ações concretas pra semana/mês (o que fazer AMANHÃ, não filosofia).

## 🤔 Pergunta pra pensar
Uma pergunta estratégica sobre o negócio.

Regras:
- Máximo 400 palavras no total
- Fale como consultor sério mas cordial (não seja robotizado)
- Use números específicos dos dados
- Sem ressalvas do tipo "não posso saber sem mais dados" — o que você não sabe, ignora
- Sem introdução ou "vamos analisar" — vai direto pra primeira seção`;

  return chamarClaude(prompt, { maxTokens: 1200, modelo });
}

async function status() {
  return {
    configurada: !!process.env.ANTHROPIC_API_KEY,
    modelo: process.env.IA_MODELO || MODELO_DEFAULT,
    provider: 'anthropic',
  };
}

module.exports = { redigirMensagem, gerarParecer, status };
