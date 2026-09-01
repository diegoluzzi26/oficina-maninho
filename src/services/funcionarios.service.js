'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Cadastro de funcionários da oficina + vales.
 * Escopo intencionalmente pequeno: não faz folha completa, só rastreia
 * pagamentos de salário e vales durante o mês.
 */

/**
 * Início da semana de pagamento: sábado após o pagamento anterior.
 * dow no Postgres: dom=0, seg=1, ..., sáb=6.
 * offset = (dow + 1) % 7  -> sáb=0, dom=1, seg=2, ..., sex=6.
 */
const INICIO_SEMANA_SQL =
  "(CURRENT_DATE - ((extract(dow FROM CURRENT_DATE)::int + 1) % 7))::date";

async function listar({ incluir_inativos } = {}) {
  const clause = incluir_inativos ? '' : 'WHERE ativo = TRUE';
  const { rows } = await db.query(
    `SELECT f.*,
            (SELECT COALESCE(sum(valor),0)::numeric
               FROM vales v WHERE v.funcionario_id = f.id AND quitado_em IS NULL) AS vales_pendentes,
            (SELECT count(*)::int
               FROM vales v WHERE v.funcionario_id = f.id AND quitado_em IS NULL) AS qtd_vales_pendentes,
            (SELECT count(*)::int
               FROM faltas fa
              WHERE fa.funcionario_id = f.id
                AND fa.data_falta >= ${INICIO_SEMANA_SQL}) AS faltas_semana,
            (SELECT count(*)::int
               FROM faltas fa WHERE fa.funcionario_id = f.id) AS faltas_total
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
  const [valesQ, salariosQ, faltasQ, faltasResumoQ] = await Promise.all([
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
    db.query(
      `SELECT fa.*, u.nome AS criado_por_nome
         FROM faltas fa
         LEFT JOIN users u ON u.id = fa.criado_por
        WHERE fa.funcionario_id = $1
        ORDER BY fa.data_falta DESC LIMIT 60`,
      [id],
    ),
    db.query(
      `SELECT
         (SELECT count(*)::int FROM faltas
           WHERE funcionario_id = $1
             AND data_falta >= ${INICIO_SEMANA_SQL}) AS faltas_semana,
         (SELECT count(*)::int FROM faltas
           WHERE funcionario_id = $1
             AND data_falta >= date_trunc('month', CURRENT_DATE)::date) AS faltas_mes,
         (SELECT count(*)::int FROM faltas
           WHERE funcionario_id = $1) AS faltas_total,
         ${INICIO_SEMANA_SQL} AS inicio_semana`,
      [id],
    ),
  ]);
  const resumoF = faltasResumoQ.rows[0];
  return {
    funcionario: f,
    vales: valesQ.rows.map((v) => ({ ...v, valor: Number(v.valor) })),
    despesas_salario: salariosQ.rows.map((d) => ({
      ...d, valor: Number(d.valor), valor_pago: Number(d.valor_pago),
    })),
    faltas: faltasQ.rows,
    resumo: {
      vales_pendentes: valesQ.rows.filter((v) => !v.quitado_em)
        .reduce((s, v) => s + Number(v.valor), 0),
      faltas_semana: resumoF.faltas_semana,
      faltas_mes: resumoF.faltas_mes,
      faltas_total: resumoF.faltas_total,
      inicio_semana: resumoF.inicio_semana,
    },
  };
}

async function criar(d) {
  const { rows } = await db.query(
    `INSERT INTO funcionarios
       (nome, cargo, salario_base, periodicidade, telefone, observacoes)
     VALUES ($1,$2,$3,COALESCE($4,'mensal'),$5,$6) RETURNING *`,
    [d.nome, d.cargo || null, d.salario_base ?? null,
     d.periodicidade || null, d.telefone || null, d.observacoes || null],
  );
  return buscarPorId(rows[0].id);
}

async function atualizar(id, d) {
  const permitidos = ['nome', 'cargo', 'salario_base', 'periodicidade',
    'telefone', 'observacoes', 'ativo'];
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

// ---- Faltas ----

async function registrarFalta({ funcionario_id, data_falta, justificada, observacoes }, userId) {
  await buscarPorId(funcionario_id);
  try {
    const { rows } = await db.query(
      `INSERT INTO faltas (funcionario_id, data_falta, justificada, observacoes, criado_por)
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), COALESCE($3, FALSE), $4, $5)
       RETURNING *`,
      [funcionario_id, data_falta || null, justificada ?? null,
        observacoes || null, userId || null],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('Já existe falta registrada para este funcionário nesta data', 409);
    }
    throw err;
  }
}

async function removerFalta(id) {
  const r = await db.query('DELETE FROM faltas WHERE id = $1', [id]);
  if (!r.rowCount) throw AppError.notFound('Falta não encontrada');
}

module.exports = {
  listar, buscarPorId, ficha, criar, atualizar, desativar,
  darVale, buscarValePorId, removerVale,
  registrarFalta, removerFalta,
};
