'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

async function listar({ busca, incluir_inativos } = {}) {
  const params = []; const where = [];
  if (!incluir_inativos) where.push('ativo = TRUE');
  if (busca) { params.push(`%${busca}%`); where.push(`nome ILIKE $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(`SELECT * FROM servicos ${clause} ORDER BY nome`, params);
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await db.query('SELECT * FROM servicos WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Serviço não encontrado');
  return rows[0];
}

async function criar(d) {
  const { rows } = await db.query(
    `INSERT INTO servicos (nome, descricao, valor_padrao, tempo_estimado_min, intervalo_retorno_meses)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [d.nome, d.descricao ?? null, d.valor_padrao,
     d.tempo_estimado_min ?? null, d.intervalo_retorno_meses ?? null],
  );
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
    `UPDATE servicos SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw AppError.notFound('Serviço não encontrado');
  return rows[0];
}

/** Desativa em vez de apagar: OS antigas referenciam o serviço. */
async function desativar(id) {
  const { rows } = await db.query(
    'UPDATE servicos SET ativo = FALSE WHERE id = $1 RETURNING *', [id],
  );
  if (!rows[0]) throw AppError.notFound('Serviço não encontrado');
  return rows[0];
}

module.exports = { listar, buscarPorId, criar, atualizar, desativar };
