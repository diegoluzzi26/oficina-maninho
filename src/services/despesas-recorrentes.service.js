'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Templates de despesa que se repetem todo mês (aluguel, água, luz…).
 * O gerador `gerarPendentes()` é chamado pelo job diário do alertas.service
 * — cria a despesa concreta quando o `dia_do_mes` chega. Idempotente:
 * o UNIQUE em (recorrente_id, mês) evita duplicata se rodar duas vezes.
 */

async function listar({ ativo = true } = {}) {
  const clause = ativo === false ? '' : 'WHERE r.ativo = TRUE';
  const { rows } = await db.query(
    `SELECT r.*, cd.nome AS categoria_nome, cd.cor AS categoria_cor,
            f.nome AS fornecedor_nome, fu.nome AS funcionario_nome
       FROM despesas_recorrentes r
       LEFT JOIN categorias_despesa cd ON cd.id = r.categoria_id
       LEFT JOIN fornecedores f        ON f.id = r.fornecedor_id
       LEFT JOIN funcionarios fu       ON fu.id = r.funcionario_id
       ${clause}
      ORDER BY r.descricao`,
  );
  return rows.map((r) => ({ ...r, valor: Number(r.valor) }));
}

async function buscarPorId(id) {
  const { rows } = await db.query('SELECT * FROM despesas_recorrentes WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Despesa recorrente não encontrada');
  return { ...rows[0], valor: Number(rows[0].valor) };
}

async function criar(d, userId) {
  const { rows } = await db.query(
    `INSERT INTO despesas_recorrentes
       (descricao, categoria_id, fornecedor_id, funcionario_id,
        valor, forma, escopo, dia_do_mes, observacoes, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [d.descricao, d.categoria_id || null, d.fornecedor_id || null,
     d.funcionario_id || null, d.valor, d.forma || 'boleto',
     d.escopo || 'oficina', d.dia_do_mes, d.observacoes || null, userId || null],
  );
  return buscarPorId(rows[0].id);
}

async function atualizar(id, d) {
  const permitidos = ['descricao', 'categoria_id', 'fornecedor_id', 'funcionario_id',
    'valor', 'forma', 'escopo', 'dia_do_mes', 'observacoes', 'ativo'];
  const campos = []; const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || !permitidos.includes(k)) continue;
    params.push(v === '' ? null : v); campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);
  params.push(id);
  const r = await db.query(
    `UPDATE despesas_recorrentes SET ${campos.join(', ')}
       WHERE id = $${params.length} RETURNING id`, params);
  if (!r.rowCount) throw AppError.notFound('Despesa recorrente não encontrada');
  return buscarPorId(id);
}

async function desativar(id) {
  const r = await db.query(
    'UPDATE despesas_recorrentes SET ativo = FALSE WHERE id = $1 RETURNING id', [id]);
  if (!r.rowCount) throw AppError.notFound('Despesa recorrente não encontrada');
}

/**
 * Gera despesas pendentes de todas as recorrências ativas.
 *
 * Para cada recorrente:
 *   - Descobre o primeiro mês que ainda não foi gerado (baseado em
 *     ultima_competencia).
 *   - Loop mês a mês até o mês atual, criando a despesa concreta se
 *     o dia_do_mes já chegou no mês corrente.
 *   - Atualiza ultima_competencia.
 *
 * Idempotente graças ao UNIQUE INDEX (recorrente_id, month).
 */
async function gerarPendentes() {
  const recs = await listar({ ativo: true });
  const hoje = new Date();
  const hojeMes = hoje.getUTCMonth();
  const hojeAno = hoje.getUTCFullYear();
  const hojeDia = hoje.getUTCDate();

  const gerados = [];

  for (const r of recs) {
    // Começa a gerar a partir do mês seguinte à última competência,
    // OU do mês atual se nunca gerou nada.
    let cursor;
    if (r.ultima_competencia) {
      cursor = new Date(r.ultima_competencia);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      cursor.setUTCDate(1);
    } else {
      cursor = new Date(hojeAno, hojeMes, 1);
    }

    while (true) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth();
      if (y > hojeAno || (y === hojeAno && m > hojeMes)) break;
      // Se o dia do mês ainda não chegou (mês corrente), não gera ainda
      if (y === hojeAno && m === hojeMes && r.dia_do_mes > hojeDia) break;

      const competencia = `${y}-${String(m + 1).padStart(2, '0')}-${String(r.dia_do_mes).padStart(2, '0')}`;
      const vencimento = competencia;

      try {
        // Verifica idempotência: já existe despesa deste recorrente
        // pra esta competência mensal?
        const ja = await db.query(
          `SELECT 1 FROM despesas
            WHERE recorrente_id = $1
              AND date_part('year',  competencia) = date_part('year',  $2::date)
              AND date_part('month', competencia) = date_part('month', $2::date)
            LIMIT 1`,
          [r.id, competencia],
        );
        if (!ja.rowCount) {
          const ins = await db.query(
            `INSERT INTO despesas
               (descricao, categoria_id, fornecedor_id, funcionario_id,
                valor, forma, escopo, vencimento, competencia,
                status, observacoes, recorrente, recorrente_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,'pendente',$10,TRUE,$11)
             RETURNING id`,
            [r.descricao, r.categoria_id, r.fornecedor_id, r.funcionario_id,
             r.valor, r.forma, r.escopo, vencimento, competencia,
             r.observacoes, r.id],
          );
          gerados.push({ recorrente_id: r.id, competencia, despesa_id: ins.rows[0].id });
        }
      } catch (err) {
        console.error(`[recorrentes] falha ao gerar ${r.descricao} ${competencia}:`, err.message);
      }

      await db.query(
        'UPDATE despesas_recorrentes SET ultima_competencia = $1::date WHERE id = $2',
        [competencia, r.id],
      );
      cursor.setUTCMonth(m + 1);
    }
  }

  return { gerados: gerados.length, itens: gerados };
}

module.exports = { listar, buscarPorId, criar, atualizar, desativar, gerarPendentes };
