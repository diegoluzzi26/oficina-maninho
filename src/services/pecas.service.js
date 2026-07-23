'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Catálogo de peças. Cresce sozinho conforme itens são lançados nas OS
 * (via os.service.garantirPecaNoCatalogo), mas também pode ser listado
 * e editado direto por aqui.
 */

async function listar({ busca, incluir_inativos } = {}) {
  const params = []; const where = [];
  if (!incluir_inativos) where.push('ativo = TRUE');
  if (busca) { params.push(`%${busca}%`); where.push(`nome ILIKE $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT * FROM pecas ${clause} ORDER BY nome`, params,
  );
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await db.query('SELECT * FROM pecas WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Peça não encontrada');
  return rows[0];
}

async function atualizar(id, d) {
  const campos = []; const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    params.push(v); campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE pecas SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw AppError.notFound('Peça não encontrada');
  return rows[0];
}

module.exports = { listar, buscarPorId, atualizar };
