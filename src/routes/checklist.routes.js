'use strict';
const router = require('express').Router({ mergeParams: true });
const { z } = require('zod');
const svc = require('../services/checklist.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const h = require('../utils/asyncHandler');

// GET /api/os/:id/checklist — retorna checklist (ou 404 se nunca criou)
router.get('/', validate({ params: v.idParam }), h(async (req, res) => {
  const cl = await svc.buscarPorOS(req.params.id);
  if (!cl) return res.status(404).json({ erro: 'Checklist ainda não criado' });
  res.json(cl);
}));

// POST /api/os/:id/checklist — cria (idempotente) e devolve
router.post('/', validate({ params: v.idParam }), h(async (req, res) => {
  await svc.garantirParaOS(req.params.id, req.user.id);
  res.status(201).json(await svc.buscarPorOS(req.params.id));
}));

// PATCH item
const atualizarItem = z.object({
  estado: z.enum(['ok', 'atencao', 'problema']).nullable().optional(),
  observacao: z.string().nullable().optional(),
});
router.patch('/itens/:itemId',
  validate({ params: z.object({ id: v.uuid, itemId: v.uuid }), body: atualizarItem }),
  h(async (req, res) => res.json(await svc.atualizarItem(req.params.itemId, req.body))));

// PATCH observação geral
router.patch('/observacao',
  validate({ params: v.idParam, body: z.object({ observacao_geral: z.string().nullable().optional() }) }),
  h(async (req, res) => res.json(await svc.atualizarObservacaoGeral(req.params.id, req.body.observacao_geral))));

module.exports = router;
