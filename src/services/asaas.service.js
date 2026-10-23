'use strict';
const db = require('../config/db');
const planos = require('../config/planos');
const assinatura = require('./assinatura.service');
const AppError = require('../utils/AppError');

/**
 * Integração de cobrança com o Asaas (Fase B).
 *
 * Config no .env:
 *   ASAAS_API_KEY        chave da API (obrigatória pra criar cliente/assinatura)
 *   ASAAS_BASE_URL       default sandbox; em produção use https://api.asaas.com/v3
 *   ASAAS_WEBHOOK_TOKEN  token que o Asaas envia no header do webhook (você
 *                        define ao cadastrar o webhook no painel do Asaas)
 *
 * Fluxo:
 *  - criarClienteEAssinatura(): cria o cliente + assinatura recorrente no
 *    Asaas e guarda os IDs na oficina. Devolve a URL de pagamento.
 *  - processarWebhook(): o Asaas chama nosso endpoint a cada evento de
 *    pagamento; mapeamos pro status da assinatura (reaproveita o enforcement
 *    da Fase A: ativa/inadimplente + proximo_vencimento dirige a graça).
 */

const BASE_URL = process.env.ASAAS_BASE_URL || 'https://sandbox.asaas.com/api/v3';
const API_KEY = process.env.ASAAS_API_KEY || '';
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';

function configurado() { return Boolean(API_KEY); }

/** Valida o token que o Asaas envia no header `asaas-access-token`. */
function webhookValido(tokenRecebido) {
  // Sem token configurado, não autentica (recusa) — evita webhook aberto.
  if (!WEBHOOK_TOKEN) return false;
  return tokenRecebido === WEBHOOK_TOKEN;
}

async function req(path, { method = 'GET', body } = {}) {
  if (!API_KEY) throw new AppError('Asaas não configurado — defina ASAAS_API_KEY no .env', 503);
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', access_token: API_KEY },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new AppError(`Asaas indisponível: ${err.message}`, 502);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.errors?.[0]?.description || `HTTP ${res.status}`;
    throw new AppError(`Asaas: ${msg}`, 502);
  }
  return json;
}

// ---------------------------------------------------------------- API client

async function criarCliente({ nome, email, cpfCnpj }) {
  const c = await req('/customers', { method: 'POST', body: { name: nome, email, cpfCnpj } });
  return c.id;
}

/**
 * Cria a assinatura recorrente de uma oficina no Asaas e grava os IDs.
 * `ciclo`: 'MONTHLY' | 'YEARLY'. `proximoVencimento`: 'YYYY-MM-DD' (1ª cobrança
 * — normalmente o fim do trial). billingType UNDEFINED = cliente escolhe
 * PIX/boleto/cartão no checkout do Asaas.
 */
async function criarClienteEAssinatura({ oficinaId, nome, email, cpfCnpj, plano, ciclo = 'MONTHLY', proximoVencimento }) {
  const p = planos.doPlano(plano);
  const valor = ciclo === 'YEARLY' ? p.anual : p.mensal;

  const customerId = await criarCliente({ nome, email, cpfCnpj });
  const sub = await req('/subscriptions', {
    method: 'POST',
    body: {
      customer: customerId,
      billingType: 'UNDEFINED',
      value: valor,
      cycle: ciclo,
      nextDueDate: proximoVencimento,
      description: `Gestão Torque — plano ${p.nome} (${ciclo === 'YEARLY' ? 'anual' : 'mensal'})`,
    },
  });

  await db.pool.query(
    'UPDATE oficinas SET asaas_customer_id = $1, asaas_subscription_id = $2 WHERE id = $3',
    [customerId, sub.id, oficinaId],
  );
  return { customerId, subscriptionId: sub.id };
}

// ---------------------------------------------------------------- Webhook

const EV_PAGO = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_RECEIVED_IN_CASH'];
const EV_VENCIDO = ['PAYMENT_OVERDUE'];

async function encontrarOficina(pay) {
  if (pay?.subscription) {
    const r = await db.pool.query(
      'SELECT id, slug FROM oficinas WHERE asaas_subscription_id = $1', [pay.subscription]);
    if (r.rows[0]) return r.rows[0];
  }
  if (pay?.customer) {
    const r = await db.pool.query(
      'SELECT id, slug FROM oficinas WHERE asaas_customer_id = $1', [pay.customer]);
    if (r.rows[0]) return r.rows[0];
  }
  return null;
}

/**
 * Mapeia um evento de pagamento do Asaas pro status da assinatura.
 * Pagamento recebido -> ativa; vencido -> inadimplente (a graça já existente
 * usa proximo_vencimento). Outros eventos não mudam status automaticamente.
 */
async function processarWebhook(body) {
  const evento = body?.event;
  const pay = body?.payment;
  if (!evento || !pay) return { ignorado: 'payload inválido' };

  const oficina = await encontrarOficina(pay);
  if (!oficina) return { ignorado: 'oficina não encontrada', subscription: pay.subscription };

  const venc = /^\d{4}-\d{2}-\d{2}$/.test(pay.dueDate || '') ? pay.dueDate : null;

  if (EV_PAGO.includes(evento)) {
    await assinatura.atualizar(oficina.id, { assinatura_status: 'ativa', proximo_vencimento: venc });
    return { oficina: oficina.slug, status: 'ativa' };
  }
  if (EV_VENCIDO.includes(evento)) {
    await assinatura.atualizar(oficina.id, { assinatura_status: 'inadimplente', proximo_vencimento: venc });
    return { oficina: oficina.slug, status: 'inadimplente' };
  }
  return { oficina: oficina.slug, ignorado: evento };
}

module.exports = {
  configurado, webhookValido, criarCliente, criarClienteEAssinatura, processarWebhook,
};
