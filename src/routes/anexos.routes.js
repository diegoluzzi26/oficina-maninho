'use strict';
const router = require('express').Router();
const multer = require('multer');
const { z } = require('zod');
const anexos = require('../services/anexos.service');
const os = require('../services/os.service');
const v = require('../validators/schemas');
const validate = require('../middleware/validate');
const requireRole = require('../middleware/requireRole');
const h = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const MB = 1024 * 1024;
const MIMES_OK = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * multer com storage em memória — o arquivo tem no máx 5 MB e vai
 * pro disco em anexos.service.salvar (mais controle sobre o path e
 * nomeação). Sem tmp files espalhados.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * MB, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!MIMES_OK.has(file.mimetype)) {
      return cb(new AppError(`Só aceito PNG, JPG ou WebP (recebi ${file.mimetype})`, 415));
    }
    cb(null, true);
  },
});

/** Wrap para converter erros do multer (Payload Too Large etc.) em AppError. */
function handleUploadErrors(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('Arquivo maior que 5MB', 413));
    return next(new AppError(`Falha no upload: ${err.message}`, 400));
  }
  next(err);
}

// ---- Anexos DE uma OS: POST/GET aninhados em /os/:id/anexos ----

router.post('/os/:id/anexos',
  validate({ params: v.idParam }),
  upload.single('arquivo'),
  handleUploadErrors,
  h(async (req, res) => {
    if (!req.file) throw new AppError('Envie o arquivo no campo "arquivo"', 400);
    // Garante que a OS existe (throw 404 se não)
    await os.buscarPorId(req.params.id);
    const salvo = await anexos.salvar({
      osId: req.params.id,
      arquivo: req.file,
      descricao: req.body?.descricao,
      userId: req.user.id,
    });
    res.status(201).json(salvo);
  }),
);

router.get('/os/:id/anexos',
  validate({ params: v.idParam }),
  h(async (req, res) => res.json(await anexos.listarPorOS(req.params.id))),
);

// ---- Bytes/delete por id do anexo ----

router.get('/anexos/:id',
  validate({ params: v.idParam }),
  h(async (req, res) => {
    const { anexo, bytes } = await anexos.bytesDoAnexo(req.params.id);
    res.setHeader('Content-Type', anexo.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(bytes);
  }),
);

router.delete('/anexos/:id',
  requireRole('admin'),
  validate({ params: v.idParam }),
  h(async (req, res) => { await anexos.remover(req.params.id); res.status(204).end(); }),
);

module.exports = router;
