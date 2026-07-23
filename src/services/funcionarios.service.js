'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Cadastro de funcionários da oficina + vales.
 * Escopo intencionalmente pequeno: não faz folha completa, só rastreia
 * pagamentos de salário e vales durante o mês.
 */

async function listar({ incluir_inativos } = {}) {
  const clause = incluir_inativos ? '' : 'WHERE ativo = TRUE';
  const { rows } = await db.query(
    `SELECT f.*,
            (SELECT COALESCE(sum(valor),0)::numeric
               FROM vales v WHERE v.funcionario_id = f.id AND quitado_em IS NULL) AS vales_pendentes,
            (SELECT count(*)::int
               FROM vales v WHERE v.funcionario_id = f.id AND quitado_em IS NULL) AS qtd_vales_pendentes
       FROM funcionarios f ${clause}
      ORDER BY f.nome`,
  );
  return rows.map((f) => ({
    ...f,
    salario_base: f.salario_base == null ? null : Number(f.salario_base),
    vales_pendentes: Number(f.vales_pendentes),
  }));
}

async function buscarPorId(id) {
  const { rows } = await db.query('SELECT * FROM funcionarios WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Funcionário não encontrado');
  const f = rows[0];
  return {
    ...f,
    salario_base: f.salario_base == null ? null : Number(f.salario_base),
  };
}

/**
 * Ficha completa: funcionário + vales (pendentes primeiro) +
 * histórico de despesas de salário nos últimos 12 meses.
 */
async function ficha(id) {
  const f = await buscarPorId(id);
  const [valesQ, salariosQ] = await Promise.all([
    db.query(
      `SELECT v.*, u.nome AS criado_por_nome
         FROM vales v
         LEFT JOIN users u ON u.id = v.criado_por
        WHERE v.funcionario_id = $1
        ORDER BY (quitado_em IS NULL) DESC, data_vale DESC LIMIT 50`,
      [id],
    ),
    db.query(
      `SELECT id, descricao, valor, COALESCE(valor_pago, valor) AS valor_pago,
              pago_em, status, competencia
         FROM despesas
        WHERE funcionario_id = $1
          AND pago_em >= (CURRENT_DATE - INTERVAL '12 months')
        ORDER BY pago_em DESC NULLS LAST LIMIT 24`,
      [id],
    ),
  ]);
  return {
    funcionario: f,
    vales: valesQ.rows.map((v) => ({ ...v, valor: Number(v.valor) })),
    despesas_salario: salariosQ.rows.map((d) => ({
      ...d, valor: Number(d.valor), valor_pago: Number(d.valor_pago),
    })),
    resumo: {
      vales_pendentes: valesQ.rows.filter((v) => !v.quitado_em)
        .reduce((s, v) => s + Number(v.valor), 0),
    },
  };
}

async function criar(d) {
  const { rows } = await db.query(
    `INSERT INTO funcionarios (nome, cargo, salario_base, telefone, observacoes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [d.nome, d.cargo || null, d.salario_base ?? null,
     d.telefone || null, d.observacoes || null],
  );
  return buscarPorId(rows[0].id);
}

async function atualizar(id, d) {
  const permitidos = ['nome', 'cargo', 'salario_base', 'telefone', 'observacoes', 'ativo'];
  const campos = []; const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (!permitidos.includes(k) || v === undefined) continue;
    params.push(v === '' ? null : v); campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);
  params.push(id);
  const r = await db.query(
    `UPDATE funcionarios SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
  if (!r.rowCount) throw AppError.notFound('Funcionário não encontrado');
  return buscarPorId(id);
}

async function desativar(id) {
  const r = await db.query(
    'UPDATE funcionarios SET ativo = FALSE WHERE id = $1 RETURNING id', [id]);
  if (!r.rowCount) throw AppError.notFound('Funcionário não encontrado');
}

// ---- Vales ----

async function darVale({ funcionario_id, valor, data_vale, observacoes }, userId) {
  await buscarPorId(funcionario_id); // valida
  const { rows } = await db.query(
    `INSERT INTO vales (funcionario_id, valor, data_vale, observacoes, criado_por)
     VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5) RETURNING id`,
    [funcionario_id, valor, data_vale || null, observacoes || null, userId || null],
  );
  return buscarValePorId(rows[0].id);
}

async function buscarValePorId(id) {
  const { rows } = await db.query('SELECT * FROM vales WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Vale não encontrado');
  return { ...rows[0], valor: Number(rows[0].valor) };
}

async function removerVale(id) {
  const r = await db.query(
    'DELETE FROM vales WHERE id = $1 AND quitado_em IS NULL', [id]);
  if (!r.rowCount) throw new AppError('Vale já foi quitado ou não existe', 422);
}

module.exports = {
  listar, buscarPorId, ficha, criar, atualizar, desativar,
  darVale, buscarValePorId, removerVale,
};
