'use strict';
const router = require('express').Router();
const { z } = require('zod');
const svc = require('../services/ia.service');
const relatorios = require('../services/relatorios.service');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');

// Só admin usa IA (evita atendente gastar API sem controle)
router.use(requireRole('admin'));

router.get('/status', h(async (_req, res) => res.json(await svc.status())));

const redigirBody = z.object({
  tipo: z.enum(['manutencao','reativacao','promocao','avaliacao','aviso','livre']).optional(),
  cliente_nome: z.string().min(1).max(120),
  veiculo: z.string().max(120).optional(),
  contexto: z.string().max(1000).optional(),
});

router.post('/redigir-mensagem', validate({ body: redigirBody }),
  h(async (req, res) => {
    const mensagem = await svc.redigirMensagem(req.body);
    res.json({ mensagem });
  }));

/**
 * Parecer da IA sobre o estado da oficina.
 * Puxa o mesmo payload do painel (mês/ano opcionais, default = mês atual)
 * e manda pro Claude analisar. Custa mais que redigir mensagem — usa
 * modelo maior por default.
 */
const parecerBody = z.object({
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
});

router.post('/parecer', validate({ body: parecerBody }),
  h(async (req, res) => {
    const painel = await relatorios.painelMes(req.body);
    const parecer = await svc.gerarParecer(painel);
    res.json({ parecer, referencia: painel.referencia });
  }));

// --- Assistentes do follow-up (só sugerem; nada é gravado aqui) ---

// Sugere o próximo follow-up de um cliente (tipo + data + mensagem).
const sugerirFollowupBody = z.object({
  cliente_id: z.string().uuid(),
});

router.post('/sugerir-followup', validate({ body: sugerirFollowupBody }),
  h(async (req, res) => {
    res.json(await svc.sugerirFollowup(req.body));
  }));

// Sugere a recorrência ideal de um serviço (intervalo_dias + template).
const sugerirRecorrenciaBody = z.object({
  servico_id: z.string().uuid(),
});

router.post('/sugerir-recorrencia', validate({ body: sugerirRecorrenciaBody }),
  h(async (req, res) => {
    res.json(await svc.sugerirRecorrencia(req.body));
  }));

// Reescreve uma mensagem já digitada, preservando as variáveis {…}.
const melhorarBody = z.object({
  texto: z.string().min(1).max(2000),
  tipo: z.string().max(40).optional(),
  contexto: z.string().max(500).optional(),
});

router.post('/melhorar-mensagem', validate({ body: melhorarBody }),
  h(async (req, res) => {
    const mensagem = await svc.melhorarMensagem(req.body);
    res.json({ mensagem });
  }));

module.exports = router;
