'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

async function listar({ cliente_id, busca }) {
  const params = [];
  const where = [];
  if (cliente_id) { params.push(cliente_id); where.push(`ca.cliente_id = $${params.length}`); }
  if (busca) {
    params.push(`%${busca.toUpperCase().replace(/[^A-Z0-9]/g, '')}%`, `%${busca}%`);
    where.push(`(upper(replace(ca.placa,'-','')) LIKE $${params.length - 1}
                 OR ca.modelo ILIKE $${params.length} OR c.nome ILIKE $${params.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT ca.*, c.nome AS cliente_nome, c.numero_cliente
       FROM carros ca JOIN clientes c ON c.id = ca.cliente_id
       ${clause} ORDER BY ca.criado_em DESC LIMIT 200`, params,
  );
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await db.query(
    `SELECT ca.*, c.nome AS cliente_nome FROM carros ca
       JOIN clientes c ON c.id=ca.cliente_id WHERE ca.id = $1`, [id],
  );
  if (!rows[0]) throw AppError.notFound('Carro não encontrado');
  return rows[0];
}

async function criar(d) {
  const { rows } = await db.query(
    `INSERT INTO carros (cliente_id, placa, marca, modelo, ano, cor, km_atual, chassi)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.cliente_id, d.placa, d.marca, d.modelo, d.ano ?? null, d.cor ?? null,
      d.km_atual ?? null, d.chassi || null],
  );
  return rows[0];
}

async function atualizar(id, d) {
  const campos = []; const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    params.push(v === '' ? null : v);
    campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE carros SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw AppError.notFound('Carro não encontrado');
  return rows[0];
}

async function remover(id) {
  const { rowCount } = await db.query('DELETE FROM carros WHERE id = $1', [id]);
  if (!rowCount) throw AppError.notFound('Carro não encontrado');
}

module.exports = { listar, buscarPorId, criar, atualizar, remover };
