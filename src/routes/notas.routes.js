'use strict';
const router = require('express').Router();
const { z } = require('zod');
const notas = require('../services/notas.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const { exigirPermissao: pode } = require('../middleware/permissoes');
const h = require('../utils/asyncHandler');

/**
 * Notas fiscais da oficina. Montado em /api/notas-fiscais atrás do recurso
 * 'fiscal'. Consultar fica com quem vê as OS; emitir e cancelar exigem a
 * permissão 'fiscal' (Equipe).
 */

router.get('/', validate({ query: z.object({ os_id: z.string().uuid() }) }), h(async (req, res) => {
  res.json(await notas.listarDaOS(req.query.os_id));
}));

const emitirBody = z.object({
  os_id: z.string().uuid(),
  tipo: z.enum(['nfse', 'nfe']),
});

router.post('/', pode('fiscal'), validate({ body: emitirBody }), h(async (req, res) => {
  const nota = await notas.emitir(req.body.os_id, req.body.tipo, {
    oficinaId: req.user.oficina_id, userId: req.user.id,
  });
  res.status(201).json(nota);
}));

router.get('/:id', validate({ params: v.idParam }), h(async (req, res) => {
  res.json(await notas.buscar(req.params.id));
}));

// Reconsulta manual na Focus (botão "atualizar" enquanto processa).
router.post('/:id/atualizar', validate({ params: v.idParam }), h(async (req, res) => {
  res.json(await notas.atualizar(req.params.id, req.user.oficina_id));
}));

// Cancelamento: a prefeitura/SEFAZ exige justificativa (15 a 255 caracteres).
const cancelarBody = z.object({
  justificativa: z.string().trim().min(15, 'Justificativa com pelo menos 15 caracteres').max(255),
});

router.post('/:id/cancelar', pode('fiscal'), validate({ params: v.idParam, body: cancelarBody }),
  h(async (req, res) => {
    res.json(await notas.cancelar(req.params.id, req.body.justificativa, req.user.oficina_id));
  }));

module.exports = router;
