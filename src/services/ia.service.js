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

// Modelos antigos que não aceitam output_config.effort (dão 400).
const SEM_ESFORCO = /haiku-4|sonnet-4-5|claude-3/;

/**
 * `esforco` (low|medium|high) controla quanto o modelo pensa antes de
 * responder. Nos modelos novos o raciocínio é ligado por padrão e os
 * tokens dele contam no max_tokens — por isso quem passa esforço deve
 * dar folga no maxTokens, senão a resposta sai vazia.
 */
async function chamarClaude(prompt, { maxTokens = 400, modelo, system, messages, esforco } = {}) {
  const chave = chaveOuFalha();
  const modeloFinal = modelo || process.env.IA_MODELO || MODELO_DEFAULT;
  const comEsforco = esforco && !SEM_ESFORCO.test(modeloFinal);

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
      ...(system ? { system } : {}),
      ...(comEsforco ? { output_config: { effort: esforco } } : {}),
      messages: messages || [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[ia] erro Anthropic:', res.status, txt);
    throw new AppError(`IA indisponível (HTTP ${res.status})`, 502);
  }
  const data = await res.json();
  // A resposta pode vir com bloco de raciocínio (thinking) antes do texto.
  const texto = (data?.content || [])
    .filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!texto) {
    console.error('[ia] resposta sem texto:', data?.stop_reason);
    throw new AppError('IA devolveu resposta vazia', 502);
  }
  return texto;
}

/**
 * Nome e cidade da oficina logada, pra personalizar os prompts. Sai do
 * schema public (tabela oficinas), pelo slug do contexto da requisição.
 */
async function perfilOficina() {
  const { rows } = await db.pool.query(
    'SELECT nome, cidade, uf, especialidades FROM oficinas WHERE slug = $1',
    [db.slugAtual()],
  );
  const o = rows[0] || {};
  const local = [o.cidade, o.uf].filter(Boolean).join('/');
  return {
    nome: o.nome || 'a oficina',
    local,
    especialidades: o.especialidades || null,
    // "Oficina X" (Cidade/UF) — pronto pra entrar no texto do prompt.
    rotulo: `"${o.nome || 'a oficina'}"${local ? ` (${local})` : ''}`,
  };
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

  const of = await perfilOficina();
  const prompt = `Você redige mensagens de WhatsApp para clientes da oficina ${of.rotulo}.

Objetivo desta mensagem: ${orientacao}

Cliente: ${cliente_nome}${veiculo ? `\nVeículo: ${veiculo}` : ''}${contexto ? `\nContexto adicional: ${contexto}` : ''}

Escreva a mensagem em português brasileiro, tom cordial mas direto (como oficina de bairro que conhece o cliente).
- Máximo 5-6 linhas curtas
- Use no máximo 2-3 emojis, com moderação
- Sem "Olá, sou fulano, da ${of.nome}" — vai direto ao ponto
- Termina convidando pra responder ou marcar
- Assinatura só se fizer sentido; não repita "${of.nome}" mais de 1 vez

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

  const of = await perfilOficina();
  const prompt = `Você é consultor de gestão pra oficinas mecânicas de bairro no Brasil. Analise os números da oficina ${of.rotulo} e dê um parecer prático.

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

  const of = await perfilOficina();
  const prompt = `Você ajuda a oficina ${of.rotulo} a decidir o próximo follow-up de WhatsApp para um cliente.

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
- Não repita "${of.nome}" mais de 1 vez.

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

  const of = await perfilOficina();
  const prompt = `Você é consultor de oficinas mecânicas. Vamos definir a recorrência de follow-up para o serviço "${servico.nome}" da oficina ${of.rotulo}.

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

  const of = await perfilOficina();
  const prompt = `Reescreva a mensagem de WhatsApp abaixo, da oficina ${of.rotulo}, deixando-a mais clara, cordial e natural.

Mensagem atual:
"""
${texto}
"""
${tipo ? `\nObjetivo: ${tipo}.` : ''}${contexto ? `\nContexto: ${contexto}.` : ''}

Regras:
- Mantenha EXATAMENTE quaisquer variáveis entre chaves como {nome_cliente}, {modelo_carro}, {placa}, {servico}, {dias_desde} — não traduza nem remova.
- Português brasileiro, tom de quem conhece o cliente. Máximo 5-6 linhas curtas, no máx 2-3 emojis.
- Não repita "${of.nome}" mais de 1 vez.

Responda APENAS com o texto da mensagem, sem aspas, sem markdown, sem introdução.`;

  const nova = await chamarClaude(prompt, { maxTokens: 500 });
  return nova.trim();
}

// Jornada de referência pro custo/hora: 22 dias × 8h, com ~70% do tempo
// realmente vendido (o resto é diagnóstico, espera de peça, limpeza…).
const HORAS_MES_POR_MECANICO = 176;
const EFICIENCIA_PADRAO = 0.7;

/**
 * Custo da hora da oficina, calculado no banco (não pela IA):
 * média das despesas pagas da oficina nos 3 últimos meses fechados,
 * dividida pelas horas produtivas do mês. Sem `horasProdutivasMes`,
 * estima pelos funcionários ativos (mínimo 1).
 */
async function custoHoraOficina(horasProdutivasMes) {
  const [despQ, funcQ] = await Promise.all([
    db.query(
      `SELECT COALESCE(sum(valor), 0)::numeric / 3 AS media_mensal
         FROM vw_despesas
        WHERE status = 'paga' AND escopo = 'oficina'
          AND pago_em >= date_trunc('month', now()) - interval '3 months'
          AND pago_em <  date_trunc('month', now())`,
    ),
    db.query('SELECT count(*)::int AS n FROM funcionarios WHERE ativo'),
  ]);
  const despesaMensal = Number(Number(despQ.rows[0].media_mensal || 0).toFixed(2));
  const mecanicos = Math.max(1, funcQ.rows[0].n);
  const horas = horasProdutivasMes
    || Math.round(mecanicos * HORAS_MES_POR_MECANICO * EFICIENCIA_PADRAO);
  return {
    despesa_media_mensal: despesaMensal,
    funcionarios_ativos: funcQ.rows[0].n,
    horas_produtivas_mes: horas,
    horas_estimadas: !horasProdutivasMes,
    custo_hora: horas > 0 ? Number((despesaMensal / horas).toFixed(2)) : 0,
  };
}

/**
 * Sugere o preço de mão de obra de um serviço. Os números que dá pra
 * calcular (custo/hora, custo mínimo, histórico cobrado) saem do banco;
 * a IA só posiciona o preço em 3 faixas e explica. Peças ficam de fora:
 * na OS elas são itens separados. Não grava nada.
 */
async function precificarServico({ servico_id, descricao, tempo_min, veiculo, observacao, horas_produtivas_mes }) {
  let servico = null;
  if (servico_id) {
    const q = await db.query(
      'SELECT id, nome, descricao, valor_padrao, tempo_estimado_min FROM servicos WHERE id = $1',
      [servico_id],
    );
    if (!q.rows[0]) throw AppError.notFound('Serviço não encontrado');
    servico = q.rows[0];
  }
  const nome = servico?.nome || String(descricao || '').trim();
  if (!nome) throw new AppError('Informe o serviço ou uma descrição', 422);
  const tempo = Number(tempo_min) || servico?.tempo_estimado_min || null;

  // Histórico do que já foi cobrado nos últimos 12 meses (pelo id do
  // catálogo ou, pra serviço avulso, pelo nome exato).
  const [custo, histQ, of] = await Promise.all([
    custoHoraOficina(horas_produtivas_mes),
    db.query(
      `SELECT count(*)::int AS vezes,
              min(os.valor_unit)::numeric AS minimo,
              round(percentile_cont(0.5) WITHIN GROUP (ORDER BY os.valor_unit)::numeric, 2) AS mediana,
              max(os.valor_unit)::numeric AS maximo
         FROM os_servicos os
         JOIN ordens_servico o ON o.id = os.os_id
        WHERE o.status IN ('paga','finalizada')
          AND o.aberta_em >= now() - interval '12 months'
          AND ($1::uuid IS NOT NULL AND os.servico_id = $1
               OR lower(os.nome_servico) = lower($2))`,
      [servico?.id || null, nome],
    ),
    perfilOficina(),
  ]);
  const historico = histQ.rows[0];
  const custoMinimo = tempo ? Number((custo.custo_hora * tempo / 60).toFixed(2)) : null;

  const prompt = `Você é consultor de precificação para oficinas mecânicas no Brasil. Ajude a oficina ${of.rotulo}${of.especialidades ? ` (especialidades: ${of.especialidades})` : ''} a definir o preço de MÃO DE OBRA de um serviço. Peças são cobradas à parte e não entram no preço.

Serviço: ${nome}${servico?.descricao ? `\nDescrição: ${servico.descricao}` : ''}${veiculo ? `\nVeículo: ${veiculo}` : ''}${observacao ? `\nObservações: ${observacao}` : ''}

Dados calculados da oficina:
${JSON.stringify({
    preco_atual_catalogo: servico ? Number(servico.valor_padrao) : null,
    tempo_estimado_min: tempo,
    custo_hora_oficina: custo.custo_hora,
    custo_minimo_mao_de_obra: custoMinimo,
    despesa_media_mensal: custo.despesa_media_mensal,
    horas_produtivas_mes: custo.horas_produtivas_mes,
    horas_produtivas_estimadas: custo.horas_estimadas,
    historico_12_meses: {
      vezes_cobrado: historico.vezes,
      minimo: historico.minimo && Number(historico.minimo),
      mediana: historico.mediana && Number(historico.mediana),
      maximo: historico.maximo && Number(historico.maximo),
    },
  }, null, 2)}

Defina 3 preços de mão de obra em reais:
- preco_minimo: abaixo disso a oficina perde dinheiro (nunca abaixo do custo_minimo_mao_de_obra, quando houver).
- preco_sugerido: preço justo de mercado pra uma oficina de bairro na região, com margem saudável.
- preco_premium: pra quando houver garantia estendida, urgência ou complexidade maior.
Se não houver tempo estimado, estime você e diga isso. Se a despesa mensal vier zerada, ignore o custo e use referência de mercado, avisando na justificativa.

Responda APENAS com um objeto JSON válido, sem markdown:
{
  "preco_minimo": 0,
  "preco_sugerido": 0,
  "preco_premium": 0,
  "tempo_estimado_min": 0,
  "justificativa": "2-3 frases explicando os números",
  "dicas": ["até 3 dicas curtas pra vender melhor esse serviço ou justificar o preço ao cliente"]
}`;

  const modelo = process.env.IA_MODELO_ANALISE || MODELO_ANALISE_DEFAULT;
  const s = extrairJson(await chamarClaude(prompt, { maxTokens: 4000, modelo, esforco: 'low' }));

  // Arredonda, garante a ordem mínimo ≤ sugerido ≤ premium e não deixa
  // o mínimo ficar abaixo do custo calculado.
  const num = (v) => Math.max(0, Math.round(Number(v) || 0));
  let [min, sug, prem] = [num(s.preco_minimo), num(s.preco_sugerido), num(s.preco_premium)]
    .sort((a, b) => a - b);
  if (custoMinimo && min < custoMinimo) min = Math.ceil(custoMinimo);
  sug = Math.max(sug, min);
  prem = Math.max(prem, sug);

  return {
    servico: servico ? { id: servico.id, nome: servico.nome, valor_padrao: Number(servico.valor_padrao) } : { nome },
    tempo_estimado_min: tempo || num(s.tempo_estimado_min) || null,
    tempo_estimado_pela_ia: !tempo,
    custo: { ...custo, custo_minimo_mao_de_obra: custoMinimo },
    historico: {
      vezes: historico.vezes,
      minimo: historico.minimo && Number(historico.minimo),
      mediana: historico.mediana && Number(historico.mediana),
      maximo: historico.maximo && Number(historico.maximo),
    },
    preco_minimo: min,
    preco_sugerido: sug,
    preco_premium: prem,
    justificativa: String(s.justificativa || '').trim(),
    dicas: Array.isArray(s.dicas) ? s.dicas.slice(0, 3).map((d) => String(d).trim()).filter(Boolean) : [],
  };
}

/**
 * Consultor de gestão em formato de conversa. Sem estado no servidor:
 * o frontend manda o histórico a cada pergunta. O retrato da oficina
 * (números do mês + custo/hora) vai no system prompt, pra IA responder
 * com base nos dados reais e não em conselho genérico.
 */
async function conversar({ mensagens }, painel) {
  const [of, custo] = await Promise.all([perfilOficina(), custoHoraOficina()]);
  const retrato = {
    referencia: painel.referencia,
    receita: painel.receita,
    despesa: painel.despesa,
    lucro: painel.lucro,
    projecao_fechamento: painel.projecao_fechamento,
    meta: painel.meta,
    qtd_os: painel.qtd_os,
    ticket_medio: painel.ticket_medio,
    clientes_atendidos: painel.clientes_atendidos,
    desconto_total_mes: painel.desconto_total_mes,
    em_aberto: painel.em_aberto,
    top_servicos: painel.top_servicos,
    comparativo_mes_anterior: painel.comparativo,
    custo_hora_oficina: custo,
  };

  const system = `Você é o consultor de gestão da oficina ${of.rotulo}${of.especialidades ? `, especialidades: ${of.especialidades}` : ''}. Quem conversa com você é o dono ou gerente.

Ajude com administração de oficina mecânica: precificação, margem, fluxo de caixa, controle de despesas, produtividade da equipe, captação e retenção de clientes, atendimento, estoque de peças, garantia e organização do dia a dia.

Números atuais da oficina (use quando forem relevantes pra pergunta):
${JSON.stringify(retrato, null, 2)}

Regras:
- Português brasileiro, direto e prático, como um consultor experiente que conhece oficina de bairro.
- Respostas curtas (até ~250 palavras), com passos concretos. Use listas quando ajudar.
- Cite os números da oficina quando sustentarem o conselho; não invente dados que não estão aqui.
- Pode usar markdown simples: ## títulos, **negrito** e listas com "- ".
- Assuntos jurídicos, tributários ou trabalhistas: dê a orientação geral e recomende confirmar com contador ou advogado.
- Se a pergunta fugir de gestão da oficina, responda em uma frase e traga a conversa de volta.`;

  const modelo = process.env.IA_MODELO_ANALISE || MODELO_ANALISE_DEFAULT;
  return chamarClaude(null, { system, messages: mensagens, maxTokens: 4000, modelo, esforco: 'low' });
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
  precificarServico, conversar,
};
