'use strict';
const router = require('express').Router();
const db = require('../config/db');
const h = require('../utils/asyncHandler');

/**
 * Endpoint público — devolve só o mínimo necessário pra popular
 * o dropdown "Escolha a oficina" na tela de login.
 *
 * NÃO exige JWT (o usuário ainda não logou) e NÃO expõe nada sensível.
 */
router.get('/', h(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, slug, nome FROM oficinas
      WHERE ativo ORDER BY nome`,
  );
  res.json(rows);
}));

module.exports = router;
