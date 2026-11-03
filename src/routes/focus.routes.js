'use strict';
const crypto = require('crypto');
const router = require('express').Router();
const db = require('../config/db');
const notas = require('../services/notas.service');
const h = require('../utils/asyncHandler');

/**
 * Webhook da Focus NFe (mudança de status de nota). Sem JWT: a Focus chama
 * de fora e manda FOCUS_WEBHOOK_TOKEN no header X-Webhook-Token (cadastrado
 * pelo fiscal.service ao conectar a oficina).
 *
 * Do corpo só usamos a `ref`. A oficina sai de public.notas_fiscais_ref e o
 * status sai de uma consulta à Focus feita por nós.
 */
function tokenValido(recebido) {
  const esperado = process.env.FOCUS_WEBHOOK_TOKEN || '';
  if (!esperado || typeof recebido !== 'string') return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/', h(async (req, res) => {
  if (!tokenValido(req.headers['x-webhook-token'])) {
    return res.status(401).json({ erro: 'token do webhook inválido' });
  }
  const ref = typeof req.body?.ref === 'string' ? req.body.ref : null;
  if (!ref) return res.json({ ignorado: 'sem ref' });

  const { rows } = await db.pool.query(
    `SELECT r.oficina_id, o.slug FROM notas_fiscais_ref r
       JOIN oficinas o ON o.id = r.oficina_id WHERE r.ref = $1`, [ref]);
  if (!rows[0]) return res.json({ ignorado: 'ref desconhecida' });

  // Falha aqui devolve 500 e a Focus tenta de novo mais tarde.
  await db.runComOficina(rows[0].slug, () => notas.atualizarPorRef(ref, rows[0].oficina_id));
  res.json({ ok: true });
}));

module.exports = router;
