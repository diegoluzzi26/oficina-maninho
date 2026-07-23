'use strict';
const db = require('../config/db');
const config = require('./config.service');
const AppError = require('../utils/AppError');

const GRAPH = 'https://graph.facebook.com';

function apiUrl(path) {
  return `${GRAPH}/${config.whatsapp().apiVersion}/${path}`;
}

function ensureEnabled() {
  if (!config.whatsapp().enabled) {
    throw new AppError(
      'WhatsApp não configurado. Defina WHATSAPP_TOKEN e PHONE_NUMBER_ID no .env',
      503,
    );
  }
}

/**
 * A Meta só permite mensagem de texto livre nas 24h seguintes à última
 * mensagem RECEBIDA do cliente. Fora dessa janela, só template aprovado.
 * Checamos antes de gastar a chamada e levar erro 131047 da API.
 */
async function janelaAberta(telefone) {
  const { rows } = await db.query(
    `SELECT max(criado_em) AS ultima
       FROM wa_messages
      WHERE telefone = $1 AND direction = 'inbound'`,
    [telefone],
  );
  const ultima = rows[0]?.ultima;
  if (!ultima) return false;
  return Date.now() - new Date(ultima).getTime() < 24 * 60 * 60 * 1000;
}

async function logMensagem(dados) {
  const {
    wa_message_id = null, direction, kind = 'text', status = 'queued',
    telefone, cliente_id = null, os_id = null,
    template_name = null, body = null, payload = null, erro = null,
    enviado_em = null,
  } = dados;

  const { rows } = await db.query(
    `INSERT INTO wa_messages
       (wa_message_id, direction, kind, status, telefone, cliente_id, os_id,
        template_name, body, payload, erro, enviado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING *`,
    [wa_message_id, direction, kind, status, telefone, cliente_id, os_id,
      template_name, body, payload, erro, enviado_em],
  );
  return rows[0] || null;
}

/** POST para a Graph API com timeout — sem isso a requisição pode pendurar. */
async function postGraph(path, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp().token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, status: 504, json: { error: { message: 'Timeout na Meta Cloud API' } } };
    }
    return { ok: false, status: 502, json: { error: { message: err.message } } };
  } finally {
    clearTimeout(timeout);
  }
}

async function enviarTexto({ telefone, mensagem, cliente_id, os_id }) {
  ensureEnabled();

  if (!(await janelaAberta(telefone))) {
    throw new AppError(
      'Janela de 24h fechada para este número. Use um template aprovado para iniciar a conversa.',
      409,
    );
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefone,
    type: 'text',
    text: { preview_url: false, body: mensagem },
  };

  const { ok, json } = await postGraph(`${config.whatsapp().phoneNumberId}/messages`, payload);
  const waId = json?.messages?.[0]?.id || null;

  const registro = await logMensagem({
    wa_message_id: waId,
    direction: 'outbound',
    kind: 'text',
    status: ok ? 'sent' : 'failed',
    telefone, cliente_id, os_id,
    body: mensagem,
    payload,
    erro: ok ? null : json,
    enviado_em: ok ? new Date() : null,
  });

  if (!ok) {
    throw new AppError(
      json?.error?.message || 'Falha ao enviar mensagem pelo WhatsApp',
      502,
      json?.error,
    );
  }
  return registro;
}

async function enviarTemplate({ telefone, template, idioma, parametros = [], cliente_id, os_id }) {
  ensureEnabled();

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefone,
    type: 'template',
    template: {
      name: template,
      language: { code: idioma || config.whatsapp().defaultLang },
      ...(parametros.length
        ? {
          components: [{
            type: 'body',
            parameters: parametros.map((p) => ({ type: 'text', text: String(p) })),
          }],
        }
        : {}),
    },
  };

  const { ok, json } = await postGraph(`${config.whatsapp().phoneNumberId}/messages`, payload);
  const waId = json?.messages?.[0]?.id || null;

  const registro = await logMensagem({
    wa_message_id: waId,
    direction: 'outbound',
    kind: 'template',
    status: ok ? 'sent' : 'failed',
    telefone, cliente_id, os_id,
    template_name: template,
    body: parametros.join(' | '),
    payload,
    erro: ok ? null : json,
    enviado_em: ok ? new Date() : null,
  });

  if (!ok) {
    throw new AppError(
      json?.error?.message || 'Falha ao enviar template pelo WhatsApp',
      502,
      json?.error,
    );
  }
  return registro;
}

/**
 * Envia texto se a janela estiver aberta, senão cai para template.
 * Usado nas notificações automáticas de OS, onde não dá pra saber
 * de antemão se o cliente escreveu nas últimas 24h.
 */
async function notificar({ telefone, mensagem, template, parametros, cliente_id, os_id }) {
  if (await janelaAberta(telefone)) {
    return enviarTexto({ telefone, mensagem, cliente_id, os_id });
  }
  if (!template) {
    throw new AppError(
      'Janela de 24h fechada e nenhum template informado para esta notificação',
      409,
    );
  }
  return enviarTemplate({
    telefone, template, idioma: config.whatsapp().defaultLang, parametros, cliente_id, os_id,
  });
}

/**
 * Processa o corpo do webhook da Meta.
 * Um POST pode trazer várias entries; cada uma com mensagens recebidas
 * e/ou atualizações de status (sent/delivered/read/failed).
 */
async function processarWebhook(body) {
  const resultado = { recebidas: 0, statusAtualizados: 0 };

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};

      // 1) Mensagens recebidas — abrem a janela de 24h
      for (const msg of value.messages || []) {
        const telefone = msg.from?.startsWith('+') ? msg.from : `+${msg.from}`;
        const texto = msg.text?.body
          || msg.button?.text
          || msg.interactive?.list_reply?.title
          || msg.interactive?.button_reply?.title
          || null;

        const { rows } = await db.query(
          'SELECT id FROM clientes WHERE telefone = $1 LIMIT 1', [telefone],
        );

        await logMensagem({
          wa_message_id: msg.id,
          direction: 'inbound',
          kind: msg.type === 'text' ? 'text' : 'other',
          status: 'delivered',
          telefone,
          cliente_id: rows[0]?.id || null,
          body: texto,
          payload: msg,
        });
        resultado.recebidas += 1;
      }

      // 2) Status de entrega das mensagens que enviamos
      for (const st of value.statuses || []) {
        const mapa = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
        const novo = mapa[st.status];
        if (!novo) continue;

        // Ordem dos estados: só avança, nunca regride (um 'sent' atrasado
        // não pode sobrescrever um 'read' já registrado).
        const peso = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

        await db.query(
          `UPDATE wa_messages
              SET status      = CASE WHEN $2 = 'failed' THEN 'failed'::wa_status
                                     WHEN $3 > (CASE status
                                                  WHEN 'queued' THEN 0 WHEN 'sent' THEN 1
                                                  WHEN 'delivered' THEN 2 WHEN 'read' THEN 3
                                                  ELSE 4 END)
                                     THEN $2::wa_status ELSE status END,
                  entregue_em = COALESCE(entregue_em, CASE WHEN $2 IN ('delivered','read') THEN now() END),
                  lido_em     = COALESCE(lido_em,     CASE WHEN $2 = 'read' THEN now() END),
                  erro        = COALESCE($4::jsonb, erro)
            WHERE wa_message_id = $1`,
          [st.id, novo, peso[novo], st.errors ? JSON.stringify(st.errors) : null],
        );
        resultado.statusAtualizados += 1;
      }
    }
  }
  return resultado;
}

/** Verificação do webhook (GET) exigida pela Meta ao configurar a URL. */
function verificarWebhook(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token === config.whatsapp().verifyToken) return challenge;
  return null;
}

module.exports = {
  enviarTexto, enviarTemplate, notificar,
  processarWebhook, verificarWebhook,
  janelaAberta, logMensagem,
};
