'use strict';
const router = require('express').Router();
const svc = require('../services/despesas.service');
const alertas = require('../services/alertas.service');
const v = require('../validators/financeiro');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

router.get('/', validate({ query: v.filtroDespesas }),
  h(async (req, res) => res.json(await svc.listarDespesas(req.query))));

// Aba "Boletos": despesas que têm vencimento
router.get('/boletos', validate({ query: v.filtroDespesas }),
  h(async (req, res) => res.json(await svc.listarDespesas({ ...req.query, somente_boletos: true }))));

router.get('/alertas', h(async (req, res) => {
  const dias = Math.min(Number(req.query.dias) || 7, 90);
  res.json(await svc.proximosVencimentos(dias));
}));

router.post('/alertas/enviar', requireRole('admin'),
  h(async (req, res) => res.json(await alertas.verificarEEnviar({ forcar: req.body?.forcar === true }))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarDespesa(req.params.id))));

router.post('/', validate({ body: v.criarDespesa }),
  h(async (req, res) => res.status(201).json(await svc.criarDespesa(req.body, req.user.id))));

router.put('/:id', validate({ params: v.idParam, body: v.atualizarDespesa }),
  h(async (req, res) => res.json(await svc.atualizarDespesa(req.params.id, req.body))));

router.patch('/:id/pagar', validate({ params: v.idParam, body: v.pagar }),
  h(async (req, res) => res.json(await svc.pagarDespesa(req.params.id, req.body))));

router.delete('/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => { await svc.removerDespesa(req.params.id); res.status(204).end(); }));

module.exports = router;
