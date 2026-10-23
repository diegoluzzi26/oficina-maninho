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

// --- Assistente de gestão ---

// Sugere preço de mão de obra (mínimo/sugerido/premium). Não grava nada.
const precificarBody = z.object({
  servico_id: z.string().uuid().optional(),
  descricao: z.string().max(200).optional(),
  tempo_min: z.coerce.number().int().min(1).max(6000).optional(),
  veiculo: z.string().max(120).optional(),
  observacao: z.string().max(500).optional(),
  horas_produtivas_mes: z.coerce.number().int().min(1).max(10000).optional(),
}).refine((b) => b.servico_id || (b.descricao && b.descricao.trim()), {
  message: 'Informe o serviço ou uma descrição',
});

router.post('/precificar', validate({ body: precificarBody }),
  h(async (req, res) => {
    res.json(await svc.precificarServico(req.body));
  }));

// Conversa com o consultor. O histórico vem do frontend; a última
// mensagem tem que ser do usuário (exigência da API do Claude).
const conversarBody = z.object({
  mensagens: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(30)
    .refine((m) => m[m.length - 1].role === 'user', { message: 'A última mensagem deve ser do usuário' }),
});

router.post('/conversar', validate({ body: conversarBody }),
  h(async (req, res) => {
    const painel = await relatorios.painelMes({});
    const resposta = await svc.conversar(req.body, painel);
    res.json({ resposta });
  }));

module.exports = router;
