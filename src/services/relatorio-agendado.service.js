'use strict';
const db = require('../config/db');
const { runComOficina } = require('../config/db');
const wa = require('./whatsapp.service');
const config = require('./config.service');

/**
 * Relatórios automáticos por WhatsApp pro dono da oficina.
 *  - Mensal: dia 1, ~08h, cobre o mês passado inteiro
 *  - Semanal: segunda, ~08h, cobre a semana passada (seg-dom)
 *
 * Destino: ALERTA_WHATSAPP no .env (mesmo número dos alertas de boletos).
 * Dedup: tabela `relatorios_enviados` chaveada por rótulo do período,
 * pra sobreviver a reinício do container.
 */

const moeda = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
const NOMES_MES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ---------------------------------------------------------------- MENSAL

async function dadosMensais(ano, mes) {
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const proxMes = mes === 12 ? `${ano + 1}-01-01`
    : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

  const [faturamento, despesa, top] = await Promise.all([
    db.query(
      `SELECT COALESCE(sum(valor_total),0)::numeric AS receita,
              count(*)::int                         AS qtd_os,
              COALESCE(avg(valor_total),0)::numeric AS ticket_medio,
              count(DISTINCT cliente_id)::int       AS clientes
         FROM vw_faturamento
        WHERE paga_em >= $1::date AND paga_em < $2::date`, [inicio, proxMes],
    ),
    db.query(
      `SELECT COALESCE(sum(COALESCE(valor_pago,valor)),0)::numeric AS despesa
         FROM despesas
        WHERE status='paga' AND escopo='oficina'
          AND pago_em >= $1::date AND pago_em < $2::date`, [inicio, proxMes],
    ),
    db.query(
      `SELECT CASE
                WHEN lower(i.nome_servico) LIKE 'mão de obra%'
                  OR lower(i.nome_servico) LIKE 'mao de obra%'
                THEN 'Mão de obra' ELSE i.nome_servico END AS nome,
              COALESCE(SUM(i.valor_total),0)::numeric AS receita
         FROM os_servicos i
         JOIN vw_faturamento f ON f.os_id = i.os_id
        WHERE f.paga_em >= $1::date AND f.paga_em < $2::date
        GROUP BY 1 ORDER BY receita DESC LIMIT 3`, [inicio, proxMes],
    ),
  ]);
  const f = faturamento.rows[0];
  const receita = Number(f.receita);
  const dsp = Number(despesa.rows[0].despesa);
  return {
    receita, despesa: dsp, lucro: receita - dsp,
    qtd_os: f.qtd_os, ticket_medio: Number(f.ticket_medio), clientes: f.clientes,
    top: top.rows.map((r) => ({ nome: r.nome, receita: Number(r.receita) })),
  };
}

function mensagemMensal(ano, mes, d) {
  const linhasTop = d.top.length
    ? d.top.map((s, i) => `${i + 1}. ${s.nome} — ${moeda(s.receita)}`).join('\n')
    : '(nenhum serviço registrado)';
  return `📊 *RELATÓRIO — ${NOMES_MES[mes - 1]}/${ano}*

💰 Receita: *${moeda(d.receita)}*
💸 Despesas: ${moeda(d.despesa)}
📈 Lucro: *${moeda(d.lucro)}*

🔧 OS pagas: ${d.qtd_os}
🎫 Ticket médio: ${moeda(d.ticket_medio)}
👥 Clientes atendidos: ${d.clientes}

*Top serviços do mês:*
${linhasTop}

_Auto Elétrica Maninho_`;
}

// ---------------------------------------------------------------- SEMANAL

async function dadosSemanais(inicio, fim) {
  const [f, d] = await Promise.all([
    db.query(
      `SELECT COALESCE(sum(valor_total),0)::numeric AS receita,
              count(*)::int                         AS qtd_os,
              count(DISTINCT cliente_id)::int       AS clientes
         FROM vw_faturamento
        WHERE paga_em >= $1::date AND paga_em <= $2::date`, [inicio, fim],
    ),
    db.query(
      `SELECT COALESCE(sum(COALESCE(valor_pago,valor)),0)::numeric AS despesa
         FROM despesas
        WHERE status='paga' AND escopo='oficina'
          AND pago_em >= $1::date AND pago_em <= $2::date`, [inicio, fim],
    ),
  ]);
  const receita = Number(f.rows[0].receita);
  const desp = Number(d.rows[0].despesa);
  return {
    receita, despesa: desp, lucro: receita - desp,
    qtd_os: f.rows[0].qtd_os, clientes: f.rows[0].clientes,
  };
}

function mensagemSemanal(inicio, fim, d) {
  const fmt = (iso) => {
    const [y, m, dia] = iso.split('-');
    return `${dia}/${m}`;
  };
  return `📅 *Resumo da semana ${fmt(inicio)} — ${fmt(fim)}*

💰 Receita: *${moeda(d.receita)}*
💸 Despesas: ${moeda(d.despesa)}
📈 Lucro: *${moeda(d.lucro)}*

🔧 OS pagas: ${d.qtd_os}
👥 Clientes atendidos: ${d.clientes}

Boa segunda! 🚀`;
}

// ---------------------------------------------------------------- ENVIO + DEDUP

async function jaEnviado(periodo) {
  const { rows } = await db.query(
    'SELECT 1 FROM relatorios_enviados WHERE periodo=$1', [periodo],
  );
  return rows.length > 0;
}

async function marcarEnviado(periodo, tipo, wa_message_id) {
  await db.query(
    `INSERT INTO relatorios_enviados (periodo, tipo, wa_message_id)
     VALUES ($1,$2,$3) ON CONFLICT (periodo) DO NOTHING`,
    [periodo, tipo, wa_message_id || null],
  );
}

async function enviarMensal(ano, mes, { forcar = false } = {}) {
  const periodo = `mensal-${ano}-${String(mes).padStart(2, '0')}`;
  if (!forcar && await jaEnviado(periodo)) return { enviado: false, motivo: 'ja-enviado' };
  const destino = config.alerta().whatsapp;
  if (!destino) return { enviado: false, motivo: 'sem-destinatario' };
  const dados = await dadosMensais(ano, mes);
  const msg = await wa.notificar({ telefone: destino, mensagem: mensagemMensal(ano, mes, dados) });
  await marcarEnviado(periodo, 'mensal', msg?.wa_message_id);
  return { enviado: true, periodo, para: destino };
}

async function enviarSemanal(inicio, fim, rotulo, { forcar = false } = {}) {
  const periodo = `semanal-${rotulo}`;
  if (!forcar && await jaEnviado(periodo)) return { enviado: false, motivo: 'ja-enviado' };
  const destino = config.alerta().whatsapp;
  if (!destino) return { enviado: false, motivo: 'sem-destinatario' };
  const dados = await dadosSemanais(inicio, fim);
  const msg = await wa.notificar({ telefone: destino, mensagem: mensagemSemanal(inicio, fim, dados) });
  await marcarEnviado(periodo, 'semanal', msg?.wa_message_id);
  return { enviado: true, periodo, para: destino };
}

// ---------------------------------------------------------------- SCHEDULER

/**
 * Retorna o rótulo ISO semanal (YYYY-Www) da segunda-feira passada.
 * Ex: se hoje é seg 2026-07-27, retorna '2026-W30' pra semana 20-26.
 */
function semanaISO(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((t - y0) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

function isoDia(d) { return d.toISOString().slice(0, 10); }

function agendar() {
  const HORA_ALVO = Number(process.env.ALERTA_HORA || 8);
  let ultimaCheck = null;

  setInterval(async () => {
    const agora = new Date();
    const chaveCheck = `${isoDia(agora)}-${agora.getHours()}`;
    if (agora.getHours() !== HORA_ALVO || chaveCheck === ultimaCheck) return;
    ultimaCheck = chaveCheck;

    // Fase 3 vai fazer loop pra rodar em cada oficina.
    await runComOficina('maninho', async () => {

    // Mensal: se hoje é dia 1, envia relatório do mês passado
    if (agora.getDate() === 1) {
      const anteMes = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      const ano = anteMes.getFullYear();
      const mes = anteMes.getMonth() + 1;
      try {
        const r = await enviarMensal(ano, mes);
        console.log(`[relatorio-mensal] ${JSON.stringify(r)}`);
      } catch (err) {
        console.error('[relatorio-mensal] falha:', err.message);
      }
    }

    // Semanal: se hoje é segunda, envia semana passada (seg-dom)
    if (agora.getDay() === 1) {
      const domingo = new Date(agora); domingo.setDate(agora.getDate() - 1);
      const segundaPassada = new Date(agora); segundaPassada.setDate(agora.getDate() - 7);
      const rotulo = semanaISO(segundaPassada);
      try {
        const r = await enviarSemanal(isoDia(segundaPassada), isoDia(domingo), rotulo);
        console.log(`[relatorio-semanal] ${JSON.stringify(r)}`);
      } catch (err) {
        console.error('[relatorio-semanal] falha:', err.message);
      }
    }
    }); // fecha runComOficina
  }, 10 * 60 * 1000).unref();

  console.log(`[relatorio-agendado] mensal (dia 1) e semanal (segunda) às ${HORA_ALVO}h`);
}

/**
 * Envios manuais: sempre referentes ao ÚLTIMO período fechado
 * (mês passado / semana passada seg-dom) e ignoram dedup.
 */
async function enviarMensalUltimo() {
  const agora = new Date();
  const ante = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  return enviarMensal(ante.getFullYear(), ante.getMonth() + 1, { forcar: true });
}

async function enviarSemanalUltimo() {
  const agora = new Date();
  const dow = agora.getDay() || 7; // 1..7 (seg=1)
  const domingoPassado = new Date(agora); domingoPassado.setDate(agora.getDate() - dow);
  const segundaPassada = new Date(domingoPassado); segundaPassada.setDate(domingoPassado.getDate() - 6);
  return enviarSemanal(isoDia(segundaPassada), isoDia(domingoPassado),
    semanaISO(segundaPassada), { forcar: true });
}

module.exports = {
  agendar, enviarMensal, enviarSemanal,
  enviarMensalUltimo, enviarSemanalUltimo,
};
