'use strict';
const router = require('express').Router();
const db = require('../config/db');
const h = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { COLUNAS_IDENTIDADE } = require('../services/auth.service');

/**
 * Endpoint público — devolve só o mínimo necessário pra popular
 * o dropdown "Escolha a oficina" na tela de login (nome, cores e a
 * versão da logo, pra tela mostrar a identidade da oficina escolhida).
 *
 * NÃO exige JWT (o usuário ainda não logou) e NÃO expõe nada sensível.
 */
router.get('/', h(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT ${COLUNAS_IDENTIDADE} FROM oficinas
      WHERE ativo ORDER BY nome`,
  );
  res.json(rows);
}));

/**
 * Logo da oficina (pública: aparece no login). A URL carrega `?v=<versão>`,
 * então dá pra cachear por muito tempo — upload novo muda a URL.
 */
router.get('/:slug/logo', h(async (req, res) => {
  const { rows } = await db.query(
    'SELECT logo, logo_mime FROM oficinas WHERE slug = $1 AND ativo AND logo IS NOT NULL',
    [req.params.slug],
  );
  if (!rows[0]) throw AppError.notFound('Logo não encontrada');
  res.set({
    'Content-Type': rows[0].logo_mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Front pode estar em outra origem (VITE_API_URL); helmet bloqueia por padrão.
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.send(rows[0].logo);
}));

module.exports = router;
