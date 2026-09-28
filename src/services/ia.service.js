'use strict';
const db = require('../config/db');
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

/**
 * Extrai o primeiro objeto JSON de um texto que a IA devolveu, tolerando
 * cercas de markdown (```json ... ```) ou texto solto em volta. Lança 502
 * se não achar JSON válido — o chamador trata como "IA indisponível".
 */
function extrairJson(texto) {
  const semCerca = texto.replace(/```(?:json)?/gi, '').trim();
  const ini = semCerca.indexOf('{');
  const fim = semCerca.lastIndexOf('}');
  if (ini !== -1 && fim > ini) {
    try {
      return JSON.parse(semCerca.slice(ini, fim + 1));
    } catch { /* cai no throw abaixo */ }
  }
  throw new AppError('IA devolveu resposta em formato inesperado', 502);
}

const TIPOS_FOLLOWUP = ['manutencao', 'reativacao', 'promocao', 'avaliacao'];

/**
 * Reúne o histórico relevante de um cliente pra alimentar a IA:
 * carros, últimas OSs (com serviços) e follow-ups anteriores.
 * Payload enxuto de propósito — só o que ajuda a decidir o próximo contato.
 */
async function coletarContextoCliente(clienteId) {
  const cli = await db.query(
    'SELECT id, nome, telefone FROM clientes WHERE id = $1', [clienteId],
  );
  if (!cli.rows[0]) throw AppError.notFound('Cliente não encontrado');

  const [carros, ordens, followups] = await Promise.all([
    db.query(
      `SELECT marca, modelo, placa, ano
         FROM carros WHERE cliente_id = $1 ORDER BY criado_em DESC`, [clienteId],
    ),
    db.query(
      `SELECT o.numero_os,
              COALESCE(o.paga_em, o.fechada_em)::date AS data,
              (CURRENT_DATE - COALESCE(o.paga_em, o.fechada_em)::date)::int AS dias_atras,
              COALESCE(
                array_agg(DISTINCT os.nome_servico)
                  FILTER (WHERE os.nome_servico IS NOT NULL), '{}'
              ) AS servicos
         FROM ordens_servico o
         LEFT JOIN os_servicos os ON os.os_id = o.id
        WHERE o.cliente_id = $1 AND o.status IN ('paga','finalizada')
        GROUP BY o.id
        ORDER BY COALESCE(o.paga_em, o.fechada_em) DESC
        LIMIT 6`, [clienteId],
    ),
    db.query(
      `SELECT tipo, status, agendado_para,
              enviado_em::date AS enviado_em
         FROM followup_fila
        WHERE cliente_id = $1
        ORDER BY criado_em DESC LIMIT 8`, [clienteId],
    ),
  ]);

  return {
    cliente: cli.rows[0],
    carros: carros.rows,
    ordens: ordens.rows,
    followups: followups.rows,
  };
}

/**
 * Sugere o PRÓXIMO follow-up pra um cliente, sem gravar nada.
 * A IA decide tipo + em quantos dias contatar + mensagem pronta, olhando
 * o histórico. A data é calculada aqui (a partir de `agendar_em_dias`) pra
 * não depender de a IA "inventar" uma data — mais confiável.
 */
async function sugerirFollowup({ cliente_id }) {
  const ctx = await coletarContextoCliente(cliente_id);

  const prompt = `Você ajuda a "Auto Elétrica Maninho" (Gravataí/RS, desde 1997) a decidir o próximo follow-up de WhatsApp para um cliente.

Histórico do cliente:
${JSON.stringify(ctx, null, 2)}

Tipos possíveis de follow-up:
- manutencao: lembrar de revisão/manutenção preventiva de um serviço já feito.
- reativacao: cliente sumido há tempo, trazer de volta sem cobrar.
- promocao: divulgar serviço/promoção que faça sentido pro veículo dele.
- avaliacao: pedir avaliação no Google após atendimento recente.

Escolha o tipo MAIS adequado agora e escreva a mensagem. Regras da mensagem:
- Português brasileiro, tom de oficina de bairro que conhece o cliente.
- Máximo 5-6 linhas curtas, no máx 2-3 emojis.
- Personalize com o nome e, quando fizer sentido, o carro/serviço.
- Não repita "Auto Elétrica Maninho" mais de 1 vez.

Responda APENAS com um objeto JSON válido, sem markdown, nesta forma exata:
{
  "tipo": "manutencao|reativacao|promocao|avaliacao",
  "agendar_em_dias": 0,
  "mensagem": "texto da mensagem pronto pra enviar",
  "justificativa": "1 frase curta explicando por que esse tipo e esse prazo"
}
Onde "agendar_em_dias" é em quantos dias a partir de hoje o contato deve ser feito (0 = hoje).`;

  const bruto = await chamarClaude(prompt, { maxTokens: 700 });
  const s = extrairJson(bruto);

  const tipo = TIPOS_FOLLOWUP.includes(s.tipo) ? s.tipo : 'manutencao';
  const dias = Math.max(0, Math.min(365, Number(s.agendar_em_dias) || 0));
  const data = new Date();
  data.setDate(data.getDate() + dias);

  return {
    cliente: ctx.cliente,
    tipo,
    agendado_para: data.toISOString().slice(0, 10),
    mensagem: String(s.mensagem || '').trim(),
    justificativa: String(s.justificativa || '').trim(),
  };
}

/**
 * Sugere a recorrência ideal pra um serviço, com base no padrão REAL de
 * retorno dos clientes. Calcula a estatística no banco (mediana do intervalo
 * entre visitas consecutivas que incluíram o serviço) e pede pra IA arredondar
 * pra um número comercial + escrever um template. Não grava regra nenhuma.
 */
async function sugerirRecorrencia({ servico_id }) {
  const svcQ = await db.query(
    'SELECT id, nome, intervalo_retorno_meses FROM servicos WHERE id = $1', [servico_id],
  );
  if (!svcQ.rows[0]) throw AppError.notFound('Serviço não encontrado');
  const servico = svcQ.rows[0];

  const statQ = await db.query(
    `WITH datas AS (
       SELECT o.cliente_id,
              COALESCE(o.paga_em, o.fechada_em)::date AS data
         FROM ordens_servico o
         JOIN os_servicos os ON os.os_id = o.id AND os.servico_id = $1
        WHERE o.status IN ('paga','finalizada')
          AND COALESCE(o.paga_em, o.fechada_em) IS NOT NULL
     ), difs AS (
       SELECT (data - LAG(data) OVER (PARTITION BY cliente_id ORDER BY data))::int AS dias
         FROM datas
     )
     SELECT count(*) FILTER (WHERE dias > 0)::int AS amostras,
            round(avg(dias) FILTER (WHERE dias > 0))::int AS media_dias,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dias)
                    FILTER (WHERE dias > 0))::int AS mediana_dias,
            min(dias) FILTER (WHERE dias > 0)::int AS min_dias,
            max(dias) FILTER (WHERE dias > 0)::int AS max_dias
       FROM difs`, [servico_id],
  );
  const amostra = statQ.rows[0];

  const prompt = `Você é consultor de oficinas mecânicas. Vamos definir a recorrência de follow-up para o serviço "${servico.nome}" da "Auto Elétrica Maninho".

Dados reais de retorno dos clientes que já fizeram esse serviço:
${JSON.stringify({
    intervalo_configurado_meses: servico.intervalo_retorno_meses,
    amostras_analisadas: amostra.amostras,
    media_dias_entre_visitas: amostra.media_dias,
    mediana_dias_entre_visitas: amostra.mediana_dias,
    minimo_dias: amostra.min_dias,
    maximo_dias: amostra.max_dias,
  }, null, 2)}

Sugira um intervalo em DIAS para lembrar o cliente (arredondado para um número redondo/comercial, ex: 90, 120, 180, 365). Se a amostra for pequena (< 5), use conhecimento de mercado pra esse tipo de serviço e diga isso na justificativa. Escreva também um template de mensagem usando as variáveis {nome_cliente}, {modelo_carro}, {placa} e {dias_desde} onde couber.

Responda APENAS com um objeto JSON válido, sem markdown:
{
  "intervalo_dias": 180,
  "mensagem_template": "texto com {nome_cliente} etc",
  "justificativa": "1-2 frases explicando o número escolhido"
}`;

  const bruto = await chamarClaude(prompt, { maxTokens: 700 });
  const s = extrairJson(bruto);

  const intervalo = Math.max(1, Math.min(1095, Number(s.intervalo_dias) || amostra.mediana_dias || 180));

  return {
    servico: { id: servico.id, nome: servico.nome },
    amostra,
    intervalo_dias: intervalo,
    mensagem_template: String(s.mensagem_template || '').trim(),
    justificativa: String(s.justificativa || '').trim(),
  };
}

/**
 * Reescreve/melhora uma mensagem que o usuário já digitou, preservando as
 * variáveis de template ({nome_cliente}, etc). Retorna só o texto novo.
 */
async function melhorarMensagem({ texto, tipo, contexto }) {
  if (!texto || !texto.trim()) throw new AppError('Texto é obrigatório', 422);

  const prompt = `Reescreva a mensagem de WhatsApp abaixo, da "Auto Elétrica Maninho" (oficina de bairro em Gravataí/RS, desde 1997), deixando-a mais clara, cordial e natural.

Mensagem atual:
"""
${texto}
"""
${tipo ? `\nObjetivo: ${tipo}.` : ''}${contexto ? `\nContexto: ${contexto}.` : ''}

Regras:
- Mantenha EXATAMENTE quaisquer variáveis entre chaves como {nome_cliente}, {modelo_carro}, {placa}, {servico}, {dias_desde} — não traduza nem remova.
- Português brasileiro, tom de quem conhece o cliente. Máximo 5-6 linhas curtas, no máx 2-3 emojis.
- Não repita "Auto Elétrica Maninho" mais de 1 vez.

Responda APENAS com o texto da mensagem, sem aspas, sem markdown, sem introdução.`;

  const nova = await chamarClaude(prompt, { maxTokens: 500 });
  return nova.trim();
}

async function status() {
  return {
    configurada: !!process.env.ANTHROPIC_API_KEY,
    modelo: process.env.IA_MODELO || MODELO_DEFAULT,
    provider: 'anthropic',
  };
}

module.exports = {
  redigirMensagem, gerarParecer, status,
  sugerirFollowup, sugerirRecorrencia, melhorarMensagem,
};
