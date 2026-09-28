'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Etapas do Kanban de OS. Cada oficina tem as suas (isolamento por schema,
 * search_path já setado pelo middleware — nada de oficina_id aqui).
 *
 * status_ao_entrar (opcional) liga a etapa ao status financeiro: quando
 * uma OS entra na etapa, o os.service dispara a transição de status.
 */

async function listar({ incluir_inativas } = {}) {
  const where = incluir_inativas ? '' : 'WHERE ativo = TRUE';
  const { rows } = await db.query(
    `SELECT * FROM etapas_kanban ${where} ORDER BY ordem, criado_em`,
  );
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await db.query('SELECT * FROM etapas_kanban WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Etapa não encontrada');
  return rows[0];
}

async function criar(d) {
  // Nova etapa entra no fim do quadro.
  const { rows } = await db.query(
    `INSERT INTO etapas_kanban (nome, cor, status_ao_entrar, ordem)
     VALUES ($1, $2, $3,
       (SELECT COALESCE(MAX(ordem), 0) + 1 FROM etapas_kanban))
     RETURNING *`,
    [d.nome, d.cor ?? null, d.status_ao_entrar ?? null],
  );
  return rows[0];
}

async function atualizar(id, d) {
  const campos = []; const params = [];
  for (const k of ['nome', 'cor', 'status_ao_entrar', 'ativo']) {
    if (d[k] === undefined) continue;
    params.push(d[k]); campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE etapas_kanban SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (!rows[0]) throw AppError.notFound('Etapa não encontrada');
  return rows[0];
}

/** Reordena em bloco: a posição no array vira a `ordem`. */
async function reordenar(ids) {
  return db.withTransaction(async (client) => {
    for (let i = 0; i < ids.length; i += 1) {
      await client.query('UPDATE etapas_kanban SET ordem = $1 WHERE id = $2', [i + 1, ids[i]]);
    }
    const { rows } = await client.query(
      'SELECT * FROM etapas_kanban WHERE ativo = TRUE ORDER BY ordem, criado_em',
    );
    return rows;
  });
}

/**
 * Desativa em vez de apagar (soft): OS podem apontar pra esta etapa.
 * Bloqueia se ainda houver OS ativa nela — o dono precisa esvaziar a
 * coluna antes (arrastando as OS pra outra etapa).
 */
async function desativar(id) {
  const emUso = await db.query(
    'SELECT count(*)::int AS n FROM ordens_servico WHERE etapa_id = $1', [id],
  );
  if (emUso.rows[0].n > 0) {
    throw new AppError(
      `Esta etapa tem ${emUso.rows[0].n} OS. Mova-as para outra coluna antes de remover.`,
      422,
    );
  }
  const { rows } = await db.query(
    'UPDATE etapas_kanban SET ativo = FALSE WHERE id = $1 RETURNING *', [id],
  );
  if (!rows[0]) throw AppError.notFound('Etapa não encontrada');
  return rows[0];
}

module.exports = { listar, buscarPorId, criar, atualizar, reordenar, desativar };
