'use strict';
const db = require('../config/db');
const { runComOficina } = require('../config/db');
const wa = require('./whatsapp.service');
const despesas = require('./despesas.service');
const agendamentos = require('./agendamentos.service');
const recorrentes = require('./despesas-recorrentes.service');
const config = require('./config.service');

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
  const w = config.whatsapp();
  const destino = config.alerta().whatsapp;
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
  if (!w.enabled) {
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
 * Manda lembrete de agendamento pra cada cliente que tem agendamento amanhã.
 * Uma mensagem por agendamento — o cliente não deve receber uma única mensagem
 * misturando serviços de veículos diferentes ou horários diferentes.
 *
 * Não deduplicamos por (agendamento, dia) porque só rodamos 1x/dia — e
 * a idempotência natural é: se um agendamento cai duas vezes em "amanhã",
 * é porque foi remarcado, e faz sentido lembrar de novo.
 */
async function enviarLembretesDeAmanha() {
  const lista = await agendamentos.agendadosDeAmanha();
  if (!lista.length) return { enviados: 0, motivo: 'Nenhum agendamento para amanhã' };
  const w = config.whatsapp();
  if (!w.enabled) return { enviados: 0, motivo: 'WhatsApp não configurado' };

  let enviados = 0;
  const falhas = [];

  for (const a of lista) {
    const hora = new Date(a.data_agendada).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
    const servicos = a.servicos.length
      ? a.servicos.map((s) => s.nome_servico).join(', ')
      : 'sua revisão';
    const mensagem = `Olá, ${a.cliente_nome}! Lembrando do seu agendamento amanhã às ${hora}, `
      + `${a.marca} ${a.modelo} (${a.placa}) — ${servicos}. Até lá! — Auto Elétrica Maninho`;

    try {
      await wa.notificar({
        telefone: a.cliente_telefone,
        mensagem,
        cliente_id: a.cliente_id,
      });
      enviados += 1;
    } catch (err) {
      falhas.push({ agendamento_id: a.id, motivo: err.message });
    }
  }

  return { enviados, falhas: falhas.length ? falhas : undefined };
}

/**
 * Agenda a verificação diária.
 * setInterval simples em vez de cron externo — o processo já roda o dia todo,
 * e isso evita mais uma peça de infraestrutura para o dono manter.
 */
function agendar() {
  let ultimoDiaExecutado = null;

  setInterval(async () => {
    // Executa dentro do contexto da oficina 'maninho'. Fase 3
    // vai fazer loop pra rodar em cada oficina cadastrada.
    await runComOficina('maninho', async () => {
      // Lê hora do banco a cada tick — permite mudar a hora via UI sem reboot.
      const horaAlvo = config.alerta().hora;
      const agora = new Date();
      const hoje = agora.toISOString().slice(0, 10);

      if (agora.getHours() !== horaAlvo || ultimoDiaExecutado === hoje) return;
      ultimoDiaExecutado = hoje;

      try {
        const g = await recorrentes.gerarPendentes();
        if (g.gerados > 0) console.log(`[recorrentes] gerou ${g.gerados} despesa(s)`);
      } catch (err) {
        console.error('[alertas] falha em recorrentes.gerarPendentes:', err.message);
      }

      try {
        const r = await verificarEEnviar();
        console.log(`[alertas] contas: ${JSON.stringify(r)}`);
      } catch (err) {
        console.error('[alertas] falha em verificarEEnviar:', err.message);
      }
      try {
        const r = await enviarLembretesDeAmanha();
        console.log(`[alertas] lembretes: ${JSON.stringify(r)}`);
      } catch (err) {
        console.error('[alertas] falha em enviarLembretesDeAmanha:', err.message);
      }
    });
  }, 10 * 60 * 1000).unref(); // a cada 10 min; unref não segura o processo

  console.log(`[alertas] verificação diária agendada (hora vem da config)`);
}

module.exports = { verificarEEnviar, enviarLembretesDeAmanha, agendar, montarMensagem };
