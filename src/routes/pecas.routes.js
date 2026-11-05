'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/pecas.service');
const ncm = require('../services/ncm.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

const filtro = z.object({
  busca: z.string().trim().optional(),
  incluir_inativos: z.coerce.boolean().optional(),
  sem_ncm: z.coerce.boolean().optional(),
});

// '' limpa o campo; pontos/traços somem.
const codigo = (n, rotulo) => z.string().trim()
  .transform((s) => s.replace(/[.\-\s]/g, ''))
  .refine((s) => s === '' || new RegExp(`^\\d{${n}}$`).test(s), `${rotulo} deve ter ${n} dígitos`)
  .transform((s) => (s === '' ? null : s)).nullable().optional();

const atualizarPeca = z.object({
  nome: z.string().min(2).optional(),
  valor_padrao: z.coerce.number().min(0).optional(),
  ativo: z.boolean().optional(),
  intervalo_retorno_meses: z.coerce.number().int().min(1).max(120).nullable().optional(),
  ncm: codigo(8, 'NCM'),
  cest: codigo(7, 'CEST'),
  cfop: codigo(4, 'CFOP'),
  unidade: z.string().trim().toUpperCase().max(6)
    .transform((s) => (s === '' ? null : s)).nullable().optional(),
});

const unificarBody = z.object({ outras: z.array(z.string().uuid()).min(1).max(50) });

router.get('/', validate({ query: filtro }),
  h(async (req, res) => res.json(await svc.listar(req.query))));

router.get('/resumo', h(async (_req, res) => res.json(await svc.resumo())));

router.get('/parecidas', requireRole('admin'), h(async (_req, res) => res.json(await svc.parecidas())));

// NCM em lote: sugestões pras peças sem NCM e aplicação do que o admin escolheu.
router.get('/ncm-lote', requireRole('admin'), h(async (_req, res) => res.json(await svc.sugestoesNcmLote())));

const ncmLoteBody = z.object({
  itens: z.array(z.object({
    id: z.string().uuid(),
    ncm: z.string().trim().transform((s) => s.replace(/[.\s]/g, '')).pipe(z.string().regex(/^\d{8}$/, 'NCM deve ter 8 dígitos')),
  })).min(1).max(500),
});

router.post('/ncm-lote', requireRole('admin'), validate({ body: ncmLoteBody }),
  h(async (req, res) => res.json(await svc.aplicarNcmLote(req.body.itens))));

router.get('/:id', validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.buscarPorId(req.params.id))));

// NCMs da tabela oficial que combinam com o nome da peça.
router.get('/:id/sugestoes-ncm', validate({ params: v.idParam }), h(async (req, res) => {
  const peca = await svc.buscarPorId(req.params.id);
  res.json(await ncm.sugerirParaPeca(peca.nome));
}));

router.put('/:id', requireRole('admin'), validate({ params: v.idParam, body: atualizarPeca }),
  h(async (req, res) => res.json(await svc.atualizar(req.params.id, req.body))));

router.post('/:id/unificar', requireRole('admin'), validate({ params: v.idParam, body: unificarBody }),
  h(async (req, res) => res.json(await svc.unificar(req.params.id, req.body.outras))));

router.delete('/:id', requireRole('admin'), validate({ params: v.idParam }),
  h(async (req, res) => res.json(await svc.desativar(req.params.id))));

module.exports = router;
