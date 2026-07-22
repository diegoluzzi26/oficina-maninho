'use strict';
const router = require('express').Router();
const wa = require('../services/whatsapp.service');
const db = require('../config/db');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const h = require('../utils/asyncHandler');

/**
 * WEBHOOK — sem autenticação JWT (a Meta não envia token nosso).
 * Montado antes do middleware de auth em app.js.
 */

// GET: verificação exigida pela Meta ao salvar a URL do webhook
router.get('/webhook', (req, res) => {
  const challenge = wa.verificarWebhook(req.query);
  if (challenge) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// POST: eventos (mensagens recebidas e status de entrega)
router.post('/webhook', h(async (req, res) => {
  // Responder 200 rápido é obrigatório: a Meta reenvia se demorarmos,
  // gerando eventos duplicados. Processamos depois de responder.
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

router.post('/enviar/template', auth, validate({ body: v.enviarTemplate }),
  h(async (req, res) => res.status(201).json(await wa.enviarTemplate(req.body))));

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

module.exports = router;
