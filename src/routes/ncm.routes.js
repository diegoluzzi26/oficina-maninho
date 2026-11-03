'use strict';
const router = require('express').Router();
const { z } = require('zod');
const ncm = require('../services/ncm.service');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

/** Consulta à tabela NCM oficial (public.ncm), pra preencher o catálogo de peças. */

router.get('/', validate({ query: z.object({ busca: z.string().trim().min(2).max(80) }) }),
  h(async (req, res) => res.json(await ncm.buscar(req.query.busca))));

router.get('/situacao', h(async (_req, res) => res.json(await ncm.situacao())));

module.exports = router;
