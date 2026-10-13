'use strict';
const db = require('../config/db');
const { paraCadaOficinaAtiva } = require('../config/db');
const followup = require('./followup.service');

/**
 * Geração automática da fila de follow-up.
 *
 * 1x/dia, ~ALERTA_HORA, roda `gerarFila()` em cada oficina ativa — popula
 * os pendentes a partir de TODAS as regras ativas. NÃO dispara WhatsApp:
 * o dono revisa no Kanban e envia manualmente (decisão de produto — evita
 * mandar mensagem pra cliente sem revisão).
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
  if (!(await habilitado())) return { pulado: 'desligado' };
  return followup.gerarFila({}, null);
}

function agendar() {
  const HORA_ALVO = Number(process.env.ALERTA_HORA || 8);
  // Dedup por oficina: no máximo uma geração por dia/hora.
  const ultimaPorOficina = new Map();

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
            console.log(`[followup-auto] ${slug}: ${r.gerados} pendente(s) gerado(s)`);
          }
        } catch (err) {
          console.error(`[followup-auto] ${slug}: falha —`, err.message);
        }
      });
    } catch (err) {
      console.error('[followup-auto] falha ao listar oficinas:', err.message);
    }
  }, 10 * 60 * 1000).unref();

  console.log(`[followup-auto] geração da fila às ${HORA_ALVO}h — por oficina (só gera, não envia)`);
}

module.exports = { agendar, gerarParaOficinaAtual };
