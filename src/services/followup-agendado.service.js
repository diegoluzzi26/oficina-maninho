'use strict';
const db = require('../config/db');
const { paraCadaOficinaAtiva } = require('../config/db');
const assinatura = require('./assinatura.service');
const followup = require('./followup.service');

/**
 * Geração automática da fila de follow-up.
 *
 * 1x/dia, ~ALERTA_HORA, roda `gerarFila()` em cada oficina ativa — popula
 * os pendentes a partir de TODAS as regras ativas. Só dispara WhatsApp
 * das automações em que o dono ligou "enviar sozinho"; o resto espera
 * revisão em Para enviar.
 *
 * Idempotente: `gerarFila` já tem dedup por (cliente, carro, regra) +
 * janela de 30 dias, então rodar de novo não duplica. O dedup em memória
 * aqui é só pra não repetir o trabalho no mesmo dia.
 *
 * Liga/desliga por oficina: chave `followup_auto_gerar` em `configuracoes`.
 * Ausente ou != 'false' = ligado (default). Setar 'false' desliga.
 */

const CHAVE_CONFIG = 'followup.auto_gerar';

function isoDia(d) { return d.toISOString().slice(0, 10); }

/** Lê o toggle direto da tabela (no contexto da oficina atual). */
async function habilitado() {
  const { rows } = await db.query(
    `SELECT valor FROM configuracoes WHERE chave = $1`, [CHAVE_CONFIG],
  );
  return !rows[0] || rows[0].valor !== 'false';
}

/**
 * Gera a fila da oficina ATUAL (precisa rodar dentro de runComOficina).
 * Respeita o toggle. Retorna { pulado } ou { gerados }.
 */
async function gerarParaOficinaAtual() {
  if (!(await assinatura.recursoNaOficinaAtual('followup'))) return { pulado: 'plano' };
  if (!(await habilitado())) return { pulado: 'desligado' };
  const r = await followup.gerarFila({}, null);
  // Automações com "enviar sozinho" ligado: o que está pendente delas sai
  // agora, em lote (até 100, com intervalo). As demais esperam revisão.
  try {
    const lote = await followup.enviarAutomaticos();
    if (lote) r.envio_automatico = lote.total;
  } catch (err) {
    r.envio_automatico_erro = err.message;
  }
  return r;
}

function agendar() {
  const HORA_ALVO = Number(process.env.ALERTA_HORA || 8);
  // Dedup por oficina: no máximo uma geração por dia/hora.
  const ultimaPorOficina = new Map();

  // A cada 10 min, confere na Evolution os envios que deram timeout
  // (itens travados em "enviando"). Só chama a Evolution se houver item.
  setInterval(async () => {
    try {
      await paraCadaOficinaAtiva(async (slug) => {
        try {
          const r = await followup.conferirEnvios({}, null);
          if (r.confirmados || r.liberados) {
            console.log(`[followup-conferir] ${slug}: ${r.confirmados} confirmado(s), ${r.liberados} liberado(s)`);
          }
        } catch (err) {
          console.error(`[followup-conferir] ${slug}: falha —`, err.message);
        }
      });
    } catch (err) {
      console.error('[followup-conferir] falha ao listar oficinas:', err.message);
    }
  }, 10 * 60 * 1000).unref();

  setInterval(async () => {
    const agora = new Date();
    if (agora.getHours() !== HORA_ALVO) return;
    const chave = `${isoDia(agora)}-${agora.getHours()}`;

    try {
      await paraCadaOficinaAtiva(async (slug) => {
        if (ultimaPorOficina.get(slug) === chave) return;
        ultimaPorOficina.set(slug, chave);
        try {
          const r = await gerarParaOficinaAtual();
          if (r.pulado) {
            console.log(`[followup-auto] ${slug}: pulado (${r.pulado})`);
          } else {
            console.log(`[followup-auto] ${slug}: ${r.gerados} pendente(s) gerado(s)`
              + (r.envio_automatico ? `, ${r.envio_automatico} saindo sozinho(s)` : '')
              + (r.envio_automatico_erro ? ` — envio automático falhou: ${r.envio_automatico_erro}` : ''));
          }
        } catch (err) {
          console.error(`[followup-auto] ${slug}: falha —`, err.message);
        }
      });
    } catch (err) {
      console.error('[followup-auto] falha ao listar oficinas:', err.message);
    }
  }, 10 * 60 * 1000).unref();

  console.log(`[followup-auto] geração da fila às ${HORA_ALVO}h — por oficina (envia sozinho só onde estiver ligado)`);
}

module.exports = { agendar, gerarParaOficinaAtual };
