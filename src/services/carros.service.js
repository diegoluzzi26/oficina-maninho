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

/**
 * Histórico completo do veículo: dados do carro + resumo (contagem, valor
 * gasto, último atendimento), lista das OS e listas consolidadas de
 * serviços realizados e peças trocadas com data — pra o atendente ver de
 * relance "esse carro já teve X, Y, Z" enquanto atende uma OS nova.
 *
 * Ignora OS excluídas (o próprio DELETE remove por CASCADE) e OS
 * canceladas (não existem no schema atual, mas o filtro fica pronto).
 */
async function historico(id) {
  const carro = await buscarPorId(id);

  const [resumoQ, osQ, servicosQ, pecasQ] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS qtd_os,
              count(*) FILTER (WHERE status = 'paga')::int AS qtd_pagas,
              COALESCE(sum(valor_pago) FILTER (WHERE status = 'paga'), 0)::numeric AS total_gasto,
              max(aberta_em) AS ultima_visita
         FROM ordens_servico WHERE carro_id = $1`, [id],
    ),
    db.query(
      `SELECT id, numero_os, status, aberta_em, fechada_em, paga_em,
              valor_total, valor_pago, km_entrada
         FROM ordens_servico WHERE carro_id = $1
         ORDER BY aberta_em DESC LIMIT 50`, [id],
    ),
    db.query(
      `SELECT os.nome_servico, os.quantidade, os.valor_unit, os.valor_total,
              o.numero_os, o.aberta_em, o.status
         FROM os_servicos os
         JOIN ordens_servico o ON o.id = os.os_id
        WHERE o.carro_id = $1
        ORDER BY o.aberta_em DESC LIMIT 100`, [id],
    ),
    db.query(
      `SELECT op.descricao, op.quantidade, op.valor_unit, op.valor_total,
              o.numero_os, o.aberta_em, o.status
         FROM os_pecas op
         JOIN ordens_servico o ON o.id = op.os_id
        WHERE o.carro_id = $1
        ORDER BY o.aberta_em DESC LIMIT 100`, [id],
    ),
  ]);

  const r = resumoQ.rows[0];
  return {
    carro,
    resumo: {
      qtd_os: r.qtd_os,
      qtd_pagas: r.qtd_pagas,
      total_gasto: Number(r.total_gasto || 0),
      ultima_visita: r.ultima_visita,
    },
    ordens: osQ.rows.map((o) => ({
      ...o,
      valor_total: Number(o.valor_total),
      valor_pago: o.valor_pago == null ? null : Number(o.valor_pago),
    })),
    servicos_realizados: servicosQ.rows.map((s) => ({
      ...s, valor_unit: Number(s.valor_unit), valor_total: Number(s.valor_total),
    })),
    pecas_trocadas: pecasQ.rows.map((p) => ({
      ...p,
      quantidade: Number(p.quantidade),
      valor_unit: Number(p.valor_unit),
      valor_total: Number(p.valor_total),
    })),
  };
}

async function remover(id) {
  const { rowCount } = await db.query('DELETE FROM carros WHERE id = $1', [id]);
  if (!rowCount) throw AppError.notFound('Carro não encontrado');
}

module.exports = { listar, buscarPorId, criar, atualizar, remover, historico };
