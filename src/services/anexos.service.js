'use strict';
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Anexos (fotos) de uma OS. Metadata no banco, bytes no disco em
 * ./anexos/os/<os_id>/<uuid>.<ext>. Só quem chama tem responsabilidade
 * de garantir a OS existe (a rota faz isso via os.service.buscarPorId).
 *
 * Restrições ficam no upload middleware (multer): 5 MB por arquivo,
 * apenas image/{png,jpeg,webp}. Aqui só persiste e devolve.
 */

const RAIZ = process.env.ANEXOS_DIR || '/app/anexos';

async function garantirDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function extensaoDe(mime, filename) {
  const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  if (map[mime]) return map[mime];
  const ext = path.extname(filename || '').slice(1).toLowerCase();
  return ext || 'bin';
}

async function salvar({ osId, arquivo, descricao, userId }) {
  const ext = extensaoDe(arquivo.mimetype, arquivo.originalname);
  const nome = `${crypto.randomUUID()}.${ext}`;
  const relativo = path.posix.join('os', osId, nome);
  const absoluto = path.join(RAIZ, relativo);

  await garantirDir(path.dirname(absoluto));
  await fs.writeFile(absoluto, arquivo.buffer);

  const { rows } = await db.query(
    `INSERT INTO os_anexos (os_id, arquivo, mime, tamanho, descricao, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [osId, relativo, arquivo.mimetype, arquivo.size, descricao || null, userId || null],
  );
  return rows[0];
}

async function listarPorOS(osId) {
  const { rows } = await db.query(
    `SELECT a.*, u.nome AS criado_por_nome
       FROM os_anexos a
       LEFT JOIN users u ON u.id = a.criado_por
      WHERE os_id = $1 ORDER BY criado_em`, [osId],
  );
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await db.query('SELECT * FROM os_anexos WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Anexo não encontrado');
  return rows[0];
}

async function bytesDoAnexo(id) {
  const a = await buscarPorId(id);
  const absoluto = path.join(RAIZ, a.arquivo);
  const bytes = await fs.readFile(absoluto).catch(() => null);
  if (!bytes) throw AppError.notFound('Arquivo não encontrado no disco');
  return { anexo: a, bytes };
}

async function remover(id) {
  const a = await buscarPorId(id);
  await db.query('DELETE FROM os_anexos WHERE id = $1', [id]);
  const absoluto = path.join(RAIZ, a.arquivo);
  await fs.unlink(absoluto).catch(() => {}); // se sumiu do disco, tá tudo bem
}

module.exports = { salvar, listarPorOS, buscarPorId, bytesDoAnexo, remover };
