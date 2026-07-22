'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Retornos = lembretes de futuras revisões geradas automaticamente
 * quando uma OS com serviços que têm `intervalo_retorno_meses` é fechada.
 * Também podem ser criados/ajustados manualmente pelo atendente.
 */

async function listar({ status, cliente_id, ate_dias, busca } = {}) {
  const params = [];
  const where = [];

  if (status)     { params.push(status);     where.push(`status = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); where.push(`cliente_id = $${params.length}`); }
  if (ate_dias !== undefined) {
    params.push(Number(ate_dias));
    where.push(`agendado_para <= (CURRENT_DATE + ($${params.length} || ' days')::interval)`);
  }
  if (busca) {
    params.push(`%${busca}%`);
    where.push(`(cliente_nome ILIKE $${params.length} OR placa ILIKE $${params.length}
                 OR servico_nome ILIKE $${params.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT * FROM vw_retornos ${clause} ORDER BY agendado_para, cliente_nome`,
  params);
  return rows.map((r) => ({ ...r, dias_para: Number(r.dias_para) }));
}

/**
 * "Do mês": tudo com agendado_para dentro do mês em referência
 * (padrão = mês atual) e ainda pendente.
 */
async function doMes({ ano, mes } = {}) {
  const params = [];
  let clause = "WHERE status = 'pendente'";
  if (ano && mes) {
    params.push(ano, mes);
    clause += ` AND date_part('year', agendado_para) = $1
                AND date_part('month', agendado_para) = $2`;
  } else {
    clause += " AND date_trunc('month', agendado_para) = date_trunc('month', CURRENT_DATE)";
  }
  const { rows } = await db.query(
    `SELECT * FROM vw_retornos ${clause} ORDER BY agendado_para`, params,
  );
  return rows.map((r) => ({ ...r, dias_para: Number(r.dias_para) }));
}

async function criar(d) {
  const { rows } = await db.query(
    `INSERT INTO retornos (cliente_id, carro_id, os_id, servico_id,
                           nome_servico, agendado_para, motivo)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [d.cliente_id, d.carro_id || null, d.os_id || null, d.servico_id || null,
     d.nome_servico || null, d.agendado_para, d.motivo || null],
  );
  return buscarPorId(rows[0].id);
}

async function buscarPorId(id) {
  const { rows } = await db.query('SELECT * FROM vw_retornos WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Retorno não encontrado');
  return { ...rows[0], dias_para: Number(rows[0].dias_para) };
}

async function atualizar(id, d) {
  const campos = []; const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    params.push(v); campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);
  params.push(id);
  const r = await db.query(
    `UPDATE retornos SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
  if (!r.rowCount) throw AppError.notFound('Retorno não encontrado');
  return buscarPorId(id);
}

async function marcarContatado(id, wa_message_id) {
  const r = await db.query(
    `UPDATE retornos SET status = 'contatado', contatado_em = now(), wa_message_id = $2
       WHERE id = $1 RETURNING id`, [id, wa_message_id || null]);
  if (!r.rowCount) throw AppError.notFound('Retorno não encontrado');
  return buscarPorId(id);
}

async function ignorar(id) {
  const r = await db.query(
    `UPDATE retornos SET status = 'ignorado' WHERE id = $1 RETURNING id`, [id]);
  if (!r.rowCount) throw AppError.notFound('Retorno não encontrado');
  return buscarPorId(id);
}

async function remover(id) {
  const r = await db.query('DELETE FROM retornos WHERE id = $1', [id]);
  if (!r.rowCount) throw AppError.notFound('Retorno não encontrado');
}

module.exports = {
  listar, doMes, criar, buscarPorId, atualizar,
  marcarContatado, ignorar, remover,
};
