'use strict';
const router = require('express').Router();
const db = require('../config/db');
const h = require('../utils/asyncHandler');

/**
 * Contador de visitas da landing (público, sem JWT). Só soma 1 no dia;
 * não guarda IP, navegador nem nada que identifique quem visitou. A landing
 * manda no máximo uma vez por dia por navegador.
 */
const PAGINAS = new Set(['landing']);

router.post('/', h(async (req, res) => {
  const pagina = PAGINAS.has(req.body?.pagina) ? req.body.pagina : 'landing';
  await db.pool.query(
    `INSERT INTO visitas_site (dia, pagina, total) VALUES (CURRENT_DATE, $1, 1)
     ON CONFLICT (dia, pagina) DO UPDATE SET total = visitas_site.total + 1`,
    [pagina],
  );
  res.sendStatus(204);
}));

module.exports = router;
