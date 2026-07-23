'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/despesas-recorrentes.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

const FORMAS = ['dinheiro', 'pix', 'boleto', 'cartao_credito',
  'cartao_debito', 'transferencia', 'cheque', 'outro'];

const criar = z.object({
  descricao: z.string().min(2),
  categoria_id: v.uuid.optional().nullable(),
  fornecedor_id: v.uuid.optional().nullable(),
  funcionario_id: v.uuid.optional().nullable(),
  valor: z.coerce.number().positive(),
  forma: z.enum(FORMAS).default('boleto'),
  escopo: z.enum(['oficina', 'pessoal']).default('oficina'),
  dia_do_mes: z.coerce.number().int().min(1).max(28),
  observacoes: z.string().optional().nullable(),
});
const atualizar = criar.partial().extend({ ativo: z.boolean().optional() });

router.use(requireRole('admin'));

router.get('/', h(async (req, res) => res.json(await svc.listar(req.query))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

router.post('/', validate({ body: criar }),
  h(async (req, res) => res.status(201).json(await svc.criar(req.body, req.user.id))));

router.put('/:id', validate({ params: v.idParam, body: atualizar }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.delete('/:id', validate({ params: v.idParam }),
  h(async (req, res) => { await svc.desativar(req.params.id); res.status(204).end(); }));

// Roda o gerador na hora (útil pra testar sem esperar o job diário)
router.post('/gerar', h(async (_req, res) => res.json(await svc.gerarPendentes())));

module.exports = router;
