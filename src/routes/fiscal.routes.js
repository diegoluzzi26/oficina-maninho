'use strict';
const router = require('express').Router();
const multer = require('multer');
const { z } = require('zod');
const fiscal = require('../services/fiscal.service');
const cnpj = require('../utils/cnpj');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

/**
 * Configuração fiscal da própria oficina. Montado em /api/fiscal atrás do
 * recurso 'fiscal' (adicional Nota fiscal). Só admin: mexe com certificado
 * digital e dados tributários.
 */
router.use(requireRole('admin'));

// '' vira null (limpar campo); espaços nas pontas somem.
const texto = (max) => z.string().trim().max(max)
  .transform((v) => (v === '' ? null : v)).nullable().optional();
const soDigitos = (n, rotulo) => z.string().trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v === '' || v.length === n, `${rotulo} deve ter ${n} dígitos`)
  .transform((v) => (v === '' ? null : v)).nullable().optional();

const configBody = z.object({
  cnpj: z.string().trim()
    .transform((v) => cnpj.limpar(v))
    .refine((v) => v === '' || cnpj.valido(v), 'CNPJ inválido')
    .transform((v) => (v === '' ? null : v)).nullable().optional(),
  razao_social: texto(150),
  nome_fantasia: texto(150),
  inscricao_municipal: texto(30),
  inscricao_estadual: z.string().trim().max(30)
    .transform((v) => (/^isento$/i.test(v) ? 'ISENTO' : v.replace(/\D/g, '')))
    .transform((v) => (v === '' ? null : v)).nullable().optional(),
  regime_tributario: z.enum(['simples_nacional', 'simples_excesso_sublimite', 'regime_normal', 'mei'])
    .nullable().optional(),
  cnae: soDigitos(7, 'CNAE'),
  email: z.string().trim().max(150)
    .refine((v) => v === '' || z.string().email().safeParse(v).success, 'E-mail inválido')
    .transform((v) => (v === '' ? null : v)).nullable().optional(),
  cep: soDigitos(8, 'CEP'),
  logradouro: texto(150),
  numero: texto(60),
  complemento: texto(60),
  bairro: texto(80),
  municipio: texto(80),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF inválida').nullable().optional(),
  nfse_padrao: z.enum(['nacional', 'municipal']).optional(),
  // Código de tributação nacional do ISS: item.subitem.desdobramento da
  // LC 116, 6 dígitos. Aceita com ou sem pontos; grava só os dígitos.
  codigo_servico: z.string().trim()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || v.length === 6, 'Código do serviço com 6 dígitos, ex. 14.01.01')
    .transform((v) => (v === '' ? null : v)).nullable().optional(),
  codigo_tributacao_municipal: texto(30),
  aliquota_iss: z.coerce.number().min(0).max(5).nullable().optional(),
  iss_retido: z.boolean().optional(),
  serie_nfe: z.coerce.number().int().min(1).max(999).optional(),
  ncm_padrao: soDigitos(8, 'NCM'),
  cfop_padrao: soDigitos(4, 'CFOP'),
  ambiente: z.enum(['homologacao', 'producao']).optional(),
}).strict();

router.get('/config', h(async (req, res) => {
  res.json(await fiscal.obter(req.user.oficina_id));
}));

router.put('/config', validate({ body: configBody }), h(async (req, res) => {
  res.json(await fiscal.salvar(req.user.oficina_id, req.body));
}));

// Certificado A1 (.pfx/.p12): fica só em memória, vai direto pra Focus.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024, files: 1, fields: 2 },
  fileFilter: (_req, file, cb) => {
    if (!/\.(pfx|p12)$/i.test(file.originalname || '')) {
      return cb(new AppError('Envie o certificado A1 (arquivo .pfx ou .p12)', 415));
    }
    cb(null, true);
  },
});

function erroUpload(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('Arquivo grande demais para um certificado A1', 413));
    return next(new AppError(`Falha no upload: ${err.message}`, 400));
  }
  next(err);
}

router.post('/certificado', upload.single('arquivo'), erroUpload, h(async (req, res) => {
  if (!req.file) throw new AppError('Envie o certificado no campo "arquivo"', 400);
  const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
  if (!senha) throw new AppError('Informe a senha do certificado', 400);
  res.json(await fiscal.conectar(req.user.oficina_id, { arquivo: req.file.buffer, senha }));
}));

module.exports = router;
