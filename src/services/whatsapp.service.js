'use strict';
const db = require('../config/db');
const config = require('./config.service');
const AppError = require('../utils/AppError');

/**
 * Provider: Evolution API (self-hosted, WhatsApp Web via Baileys).
 *
 * Diferenças em relação ao antigo Meta Cloud API:
 *   - Sem "template". Envia texto livre pra qualquer contato, sempre.
 *   - Sem janela de 24h. `janelaAberta()` retorna sempre true (mantido
 *     na assinatura pra não quebrar chamadas antigas).
 *   - Sem custo por mensagem — só custo de hospedar o container.
 *   - Requer sessão do WhatsApp Web ativa (QR code lido uma vez).
 *
 * Endpoints usados:
 *   POST {url}/instance/create            — cria instância se não existe
 *   GET  {url}/instance/connect/{name}    — QR code / status
 *   GET  {url}/instance/connectionState/{name}
 *   POST {url}/message/sendText/{name}    — envia texto
 *   POST {url}/message/sendMedia/{name}   — envia mídia (foto/PDF/áudio)
 *
 * Webhook global aponta pra /api/whatsapp/webhook — Evolution manda
 * MESSAGES_UPSERT (novas), MESSAGES_UPDATE (delivered/read),
 * SEND_MESSAGE (nossas mensagens saindo), CONNECTION_UPDATE, QRCODE_UPDATED.
 */

const GRAPH_ERRO_500 = 'Evolution API respondeu 500 — checar logs do container evolution';

function evo() { return config.whatsapp(); }

function ensureEnabled() {
  const e = evo();
  if (!e.enabled) {
    throw new AppError(
      'WhatsApp não configurado. Preencha URL, API key e instância em Configurações.',
      503,
    );
  }
  return e;
}

/** Chama a Evolution API com timeout. Sem timeout uma queda no container trava a request. */
async function evolutionRequest(path, { method = 'GET', body } = {}) {
  const e = ensureEnabled();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${e.url}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        apikey: e.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError('Evolution API não respondeu em 15s', 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Evolution não tem "janela de 24h" — texto livre funciona sempre.
 * Mantido pra compatibilidade com quem já chama.
 */
async function janelaAberta(_telefone) {
  return true;
}

async function logMensagem(dados) {
  const {
    wa_message_id = null, direction, kind = 'text', status = 'queued',
    telefone, cliente_id = null, os_id = null,
    body = null, payload = null, erro = null, enviado_em = null,
  } = dados;

  const { rows } = await db.query(
    `INSERT INTO wa_messages
       (wa_message_id, direction, kind, status, telefone, cliente_id, os_id,
        template_name, body, payload, erro, enviado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING *`,
    [wa_message_id, direction, kind, status, telefone, cliente_id, os_id,
      null, body, payload, erro, enviado_em],
  );
  return rows[0] || null;
}

/** Normaliza telefone E.164 pra formato aceito pela Evolution: só dígitos. */
function digitos(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/**
 * Envia texto pelo WhatsApp via Evolution.
 * `mensagem` é texto puro — Evolution suporta \n e emoji nativos.
 */
async function enviarTexto({ telefone, mensagem, cliente_id, os_id }) {
  const e = ensureEnabled();
  const numero = digitos(telefone);

  const { ok, status, json } = await evolutionRequest(
    `/message/sendText/${e.instance}`,
    { method: 'POST', body: { number: numero, text: mensagem } },
  );

  if (!ok) {
    const motivo = json?.response?.message || json?.message || `HTTP ${status}`;
    await logMensagem({
      direction: 'outbound', kind: 'text', status: 'failed',
      telefone, cliente_id, os_id, body: mensagem,
      payload: json, erro: { motivo, status },
    });
    throw new AppError(`Falha ao enviar WhatsApp: ${motivo}`, status === 500 ? 502 : status);
  }

  // Evolution devolve key.id (wa_message_id) na resposta
  const waId = json?.key?.id || json?.messageId || json?.id || null;
  const rec = await logMensagem({
    wa_message_id: waId,
    direction: 'outbound', kind: 'text', status: 'sent',
    telefone, cliente_id, os_id, body: mensagem,
    payload: json, enviado_em: new Date(),
  });
  return { id: waId, wa_message_id: waId, registro: rec };
}

/**
 * Retrocompat: alguns call sites antigos chamavam `enviarTemplate` ou
 * passavam `template` como fallback. Evolution não tem essa diferença;
 * usamos sempre `enviarTexto` com o texto que já vinha montado.
 */
async function enviarTemplate({ telefone, mensagem, cliente_id, os_id }) {
  return enviarTexto({ telefone, mensagem, cliente_id, os_id });
}

async function notificar({ telefone, mensagem, cliente_id, os_id }) {
  return enviarTexto({ telefone, mensagem, cliente_id, os_id });
}

// ---------------------------------------------------------------------
// Webhook: Evolution manda vários tipos de evento pro nosso endpoint.
// ---------------------------------------------------------------------

const MAPA_STATUS = {
  PENDING: 'queued',
  SERVER_ACK: 'sent',
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
  ERROR: 'failed',
};

async function processarWebhook(body) {
  const evento = body?.event;
  const dados  = body?.data;
  if (!evento || !dados) return { ignorado: true };

  const resultado = { evento, tratado: 0 };

  // Mensagens novas (recebidas OU nossas próprias enviadas — dependendo de fromMe)
  if (evento === 'messages.upsert' || evento === 'MESSAGES_UPSERT') {
    const messages = Array.isArray(dados) ? dados : [dados];
    for (const msg of messages) {
      const fromMe   = msg?.key?.fromMe || false;
      const remoteJid = msg?.key?.remoteJid || '';
      const numero   = remoteJid.replace(/@.*/, '');
      if (!numero) continue;
      const telefone = numero.startsWith('+') ? numero : `+${numero}`;
      const texto    = msg?.message?.conversation
                    || msg?.message?.extendedTextMessage?.text
                    || '';
      const waId     = msg?.key?.id || null;

      // Amarra a cliente_id se o telefone bate
      const c = await db.query('SELECT id FROM clientes WHERE telefone = $1', [telefone]);
      const clienteId = c.rows[0]?.id || null;

      await logMensagem({
        wa_message_id: waId,
        direction: fromMe ? 'outbound' : 'inbound',
        kind: 'text',
        status: fromMe ? 'sent' : 'delivered',
        telefone, cliente_id: clienteId, body: texto,
        payload: msg,
      });
      resultado.tratado += 1;
    }
  }

  // Atualização de status (delivered → read → failed)
  if (evento === 'messages.update' || evento === 'MESSAGES_UPDATE') {
    const messages = Array.isArray(dados) ? dados : [dados];
    for (const upd of messages) {
      const waId = upd?.key?.id;
      const statusMeta = upd?.update?.status || upd?.status;
      const status = MAPA_STATUS[statusMeta] || null;
      if (!waId || !status) continue;

      // Progressão monotônica: nunca "regride" de read pra sent
      const OrdemStatus = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
      await db.query(
        `UPDATE wa_messages
            SET status = $1,
                entregue_em = CASE WHEN $1 = 'delivered' THEN now() ELSE entregue_em END,
                lido_em     = CASE WHEN $1 = 'read'      THEN now() ELSE lido_em     END
          WHERE wa_message_id = $2
            AND $3 > COALESCE((
              SELECT CASE status
                WHEN 'queued' THEN 0 WHEN 'sent' THEN 1
                WHEN 'delivered' THEN 2 WHEN 'read' THEN 3
                WHEN 'failed' THEN 4 END
              FROM wa_messages WHERE wa_message_id = $2
            ), -1)`,
        [status, waId, OrdemStatus[status]],
      );
      resultado.tratado += 1;
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------
// Instância: criar, checar estado, pegar QR code.
// Usados pela UI de Configurações pra o dono conectar o número.
// ---------------------------------------------------------------------

async function garantirInstancia() {
  const e = ensureEnabled();
  // fetchInstances retorna array — se o nome não está lá, cria
  const listaResp = await evolutionRequest('/instance/fetchInstances');
  const existe = Array.isArray(listaResp.json)
    && listaResp.json.some((i) => i?.name === e.instance || i?.instance?.instanceName === e.instance);
  if (existe) return { criada: false };

  const cria = await evolutionRequest('/instance/create', {
    method: 'POST',
    body: {
      instanceName: e.instance,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    },
  });
  if (!cria.ok) throw new AppError(`Falha ao criar instância: ${cria.json?.message || cria.status}`, 502);
  return { criada: true, resposta: cria.json };
}

async function estadoConexao() {
  const e = ensureEnabled();
  const r = await evolutionRequest(`/instance/connectionState/${e.instance}`);
  if (!r.ok) return { conectado: false, estado: 'nao_encontrada', erro: r.json };
  const estado = r.json?.instance?.state || r.json?.state || 'desconhecido';
  return { conectado: estado === 'open', estado, bruto: r.json };
}

async function qrCode() {
  const e = ensureEnabled();
  await garantirInstancia();
  const r = await evolutionRequest(`/instance/connect/${e.instance}`);
  // Evolution devolve base64 do QR em `.base64` ou `.qrcode`
  const base64 = r.json?.base64 || r.json?.qrcode?.base64 || null;
  const pairingCode = r.json?.pairingCode || null;
  return {
    ok: r.ok,
    conectado: r.json?.instance?.state === 'open',
    base64,
    pairingCode,
    bruto: r.json,
  };
}

async function desconectar() {
  const e = ensureEnabled();
  const r = await evolutionRequest(`/instance/logout/${e.instance}`, { method: 'DELETE' });
  if (!r.ok) throw new AppError(`Falha ao desconectar: ${r.json?.message || r.status}`, 502);
  return r.json;
}

module.exports = {
  janelaAberta,
  enviarTexto,
  enviarTemplate,
  notificar,
  processarWebhook,
  garantirInstancia,
  estadoConexao,
  qrCode,
  desconectar,
};
