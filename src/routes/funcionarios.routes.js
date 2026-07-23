'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/funcionarios.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

const criarFuncionario = z.object({
  nome: z.string().min(2, 'Nome muito curto'),
  cargo: z.string().optional().nullable(),
  salario_base: z.coerce.number().min(0).optional().nullable(),
  telefone: v.telefone.optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

const atualizarFuncionario = criarFuncionario.partial().extend({
  ativo: z.boolean().optional(),
});

const darVale = z.object({
  funcionario_id: v.uuid,
  valor: z.coerce.number().positive(),
  data_vale: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observacoes: z.string().optional().nullable(),
});

router.use(requireRole('admin'));  // só dono edita/vê

router.get('/', h(async (req, res) => res.json(await svc.listar(req.query))));

router.get('/:id/ficha', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.ficha(req.params.id))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

router.post('/', validate({ body: criarFuncionario }),
  h(async (req, res) => res.status(201).json(await svc.criar(req.body))));

router.put('/:id', validate({ params: v.idParam, body: atualizarFuncionario }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.delete('/:id', validate({ params: v.idParam }),
  h(async (req, res) => { await svc.desativar(req.params.id); res.status(204).end(); }));

// Vales
router.post('/vales', validate({ body: darVale }),
  h(async (req, res) => res.status(201).json(await svc.darVale(req.body, req.user.id))));

router.delete('/vales/:id', validate({ params: v.idParam }),
  h(async (req, res) => { await svc.removerVale(req.params.id); res.status(204).end(); }));

module.exports = router;
