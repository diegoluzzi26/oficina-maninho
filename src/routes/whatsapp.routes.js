'use strict';
const router = require('express').Router();
const wa = require('../services/whatsapp.service');
const db = require('../config/db');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const h = require('../utils/asyncHandler');

/**
 * Webhook global do Evolution API. Sem auth JWT porque a Evolution
 * chama do próprio container, sem passar por header. Se um dia expor
 * externamente, adicione um segredo compartilhado via header.
 */
router.post('/webhook', h(async (req, res) => {
  // Responde 200 rápido pra Evolution não repetir o evento
  res.sendStatus(200);
  try {
    await wa.processarWebhook(req.body);
  } catch (err) {
    console.error('[whatsapp] falha ao processar webhook:', err.message);
  }
}));

// --- rotas autenticadas ---
router.post('/enviar/texto', auth, validate({ body: v.enviarTexto }),
  h(async (req, res) => res.status(201).json(await wa.enviarTexto(req.body))));

// Retrocompat: rota /enviar/template existia com Meta. Com Evolution,
// tudo vira texto livre. Mantida pra não quebrar integração antiga.
router.post('/enviar/template', auth, validate({ body: v.enviarTemplate }),
  h(async (req, res) => {
    const { telefone, mensagem, parametros, cliente_id, os_id } = req.body;
    // Se o cliente veio no formato template + parametros mas sem mensagem,
    // monta um texto simples juntando os parâmetros pra não perder informação.
    const texto = mensagem
      || (Array.isArray(parametros) ? parametros.join(' — ') : String(parametros || ''));
    res.status(201).json(await wa.enviarTexto({ telefone, mensagem: texto, cliente_id, os_id }));
  }));

router.get('/mensagens', auth, h(async (req, res) => {
  const { telefone, cliente_id, os_id, limite = 50 } = req.query;
  const params = []; const where = [];
  if (telefone)   { params.push(telefone);   where.push(`telefone = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); where.push(`cliente_id = $${params.length}`); }
  if (os_id)      { params.push(os_id);      where.push(`os_id = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(Math.min(Number(limite) || 50, 200));

  const { rows } = await db.query(
    `SELECT id, wa_message_id, direction, kind, status, telefone, template_name,
            body, enviado_em, entregue_em, lido_em, criado_em
       FROM wa_messages ${clause} ORDER BY criado_em DESC LIMIT $${params.length}`,
    params,
  );
  res.json(rows);
}));

router.get('/janela/:telefone', auth, h(async (req, res) => {
  const { toE164 } = require('../utils/phone');
  const tel = toE164(req.params.telefone);
  res.json({ telefone: tel, janela_aberta: await wa.janelaAberta(tel) });
}));

// --- Conexão / QR code (só admin) ---
const requireRole = require('../middleware/requireRole');

router.get('/conexao', auth, requireRole('admin'),
  h(async (_req, res) => res.json(await wa.estadoConexao())));

router.post('/conexao/qrcode', auth, requireRole('admin'),
  h(async (_req, res) => res.json(await wa.qrCode())));

router.post('/conexao/desconectar', auth, requireRole('admin'),
  h(async (_req, res) => res.json(await wa.desconectar())));

module.exports = router;
