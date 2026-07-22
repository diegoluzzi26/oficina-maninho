'use strict';
const db = require('../config/db');
const wa = require('./whatsapp.service');
const despesas = require('./despesas.service');
const env = require('../config/env');

/**
 * Alertas de vencimento para o dono da oficina.
 *
 * O número de destino vem de ALERTA_WHATSAPP no .env. Sem ele configurado,
 * os alertas ficam só dentro do sistema (badge no menu) — a função não falha,
 * apenas informa que não há destinatário.
 */

const TIPOS = {
  previa_3d: (d) => `Boleto vence em ${d.dias_para_vencer} dia(s)`,
  vence_hoje: () => 'Boleto vence HOJE',
  atrasada: (d) => `Boleto ATRASADO há ${Math.abs(d.dias_para_vencer)} dia(s)`,
};

function classificar(d) {
  if (d.dias_para_vencer < 0) return 'atrasada';
  if (d.dias_para_vencer === 0) return 'vence_hoje';
  if (d.dias_para_vencer <= 3) return 'previa_3d';
  return null;
}

const moeda = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

function montarMensagem(lista) {
  const linhas = lista.map((d) => {
    const quando = d.dias_para_vencer < 0
      ? `atrasado há ${Math.abs(d.dias_para_vencer)}d`
      : d.dias_para_vencer === 0 ? 'vence hoje' : `vence em ${d.dias_para_vencer}d`;
    const forn = d.fornecedor_nome ? ` — ${d.fornecedor_nome}` : '';
    return `• ${d.descricao}${forn}: ${moeda(d.valor)} (${quando})`;
  });
  const total = lista.reduce((s, d) => s + Number(d.valor), 0);
  return `*Contas a pagar — Auto Elétrica Maninho*\n\n${linhas.join('\n')}\n\n`
    + `Total: ${moeda(total)}`;
}

/**
 * Verifica vencimentos e envia UM resumo por WhatsApp.
 *
 * O log em alertas_despesa tem UNIQUE (despesa_id, tipo), então cada despesa
 * gera no máximo um aviso por estágio — sem spam se a função rodar várias vezes.
 */
async function verificarEEnviar({ forcar = false } = {}) {
  const destino = process.env.ALERTA_WHATSAPP;
  const painel = await despesas.proximosVencimentos(3);

  const candidatas = [...painel.atrasadas, ...painel.vence_hoje, ...painel.proximas];

  if (!candidatas.length) {
    return { enviado: false, motivo: 'Nenhum vencimento próximo', quantidade: 0 };
  }
  if (!destino) {
    return {
      enviado: false,
      motivo: 'ALERTA_WHATSAPP não configurado no .env',
      quantidade: candidatas.length,
      despesas: candidatas,
    };
  }
  if (!env.whatsapp.enabled) {
    return {
      enviado: false,
      motivo: 'WhatsApp não configurado',
      quantidade: candidatas.length,
      despesas: candidatas,
    };
  }

  // Filtra o que já foi avisado neste estágio
  const novas = [];
  for (const d of candidatas) {
    const tipo = classificar(d);
    if (!tipo) continue;

    if (!forcar) {
      const { rows } = await db.query(
        'SELECT 1 FROM alertas_despesa WHERE despesa_id=$1 AND tipo=$2', [d.id, tipo],
      );
      if (rows.length) continue;
    }
    novas.push({ ...d, tipo });
  }

  if (!novas.length) {
    return { enviado: false, motivo: 'Todos os vencimentos já foram avisados', quantidade: 0 };
  }

  try {
    const msg = await wa.notificar({
      telefone: destino,
      mensagem: montarMensagem(novas),
      template: process.env.WHATSAPP_TEMPLATE_ALERTA || 'alerta_contas',
      parametros: [String(novas.length), moeda(novas.reduce((s, d) => s + Number(d.valor), 0))],
    });

    for (const d of novas) {
      await db.query(
        `INSERT INTO alertas_despesa (despesa_id, tipo, wa_message_id)
         VALUES ($1,$2,$3) ON CONFLICT (despesa_id, tipo) DO NOTHING`,
        [d.id, d.tipo, msg?.wa_message_id || null],
      );
    }

    return { enviado: true, quantidade: novas.length, para: destino };
  } catch (err) {
    // Falha de WhatsApp não pode derrubar nada: o alerta continua visível na tela
    return {
      enviado: false,
      motivo: err.message,
      quantidade: novas.length,
      despesas: novas,
    };
  }
}

/**
 * Agenda a verificação diária.
 * setInterval simples em vez de cron externo — o processo já roda o dia todo,
 * e isso evita mais uma peça de infraestrutura para o dono manter.
 */
function agendar() {
  const horaAlvo = Number(process.env.ALERTA_HORA || 8);
  let ultimoDiaExecutado = null;

  setInterval(async () => {
    const agora = new Date();
    const hoje = agora.toISOString().slice(0, 10);

    if (agora.getHours() !== horaAlvo || ultimoDiaExecutado === hoje) return;
    ultimoDiaExecutado = hoje;

    try {
      const r = await verificarEEnviar();
      console.log(`[alertas] verificação diária: ${JSON.stringify(r)}`);
    } catch (err) {
      console.error('[alertas] falha na verificação diária:', err.message);
    }
  }, 10 * 60 * 1000).unref(); // a cada 10 min; unref não segura o processo

  console.log(`[alertas] verificação diária agendada para ~${horaAlvo}h`);
}

module.exports = { verificarEEnviar, agendar, montarMensagem };
