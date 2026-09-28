'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');
const retornos = require('./retornos.service');
const followup = require('./followup.service');

/**
 * Automações por etapa do Kanban: "ao entrar nesta etapa, faça X".
 *
 * Princípio do projeto: nenhuma ação envia WhatsApp sozinha. O follow-up
 * enfileirado nasce 'pendente' e só sai com o opt-in manual de sempre.
 */

function daquiADias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + (Number(dias) || 0));
  return d.toISOString().slice(0, 10);
}

// ---- CRUD ----

async function listar(etapaId) {
  const { rows } = await db.query(
    'SELECT * FROM etapa_regras WHERE etapa_id = $1 ORDER BY criado_em', [etapaId],
  );
  return rows;
}

async function criar(etapaId, d) {
  const etapa = await db.query('SELECT id FROM etapas_kanban WHERE id = $1', [etapaId]);
  if (!etapa.rows[0]) throw AppError.notFound('Etapa não encontrada');
  const { rows } = await db.query(
    `INSERT INTO etapa_regras (etapa_id, acao, params, gatilho)
     VALUES ($1, $2, $3::jsonb, 'ao_entrar') RETURNING *`,
    [etapaId, d.acao, JSON.stringify(d.params || {})],
  );
  return rows[0];
}

async function atualizar(id, d) {
  const campos = []; const params = [];
  if (d.acao !== undefined)  { params.push(d.acao); campos.push(`acao = $${params.length}`); }
  if (d.params !== undefined) {
    params.push(JSON.stringify(d.params)); campos.push(`params = $${params.length}::jsonb`);
  }
  if (d.ativo !== undefined) { params.push(d.ativo); campos.push(`ativo = $${params.length}`); }
  if (!campos.length) {
    const atual = await db.query('SELECT * FROM etapa_regras WHERE id = $1', [id]);
    if (!atual.rows[0]) throw AppError.notFound('Regra não encontrada');
    return atual.rows[0];
  }
  params.push(id);
  const { rows } = await db.query(
    `UPDATE etapa_regras SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw AppError.notFound('Regra não encontrada');
  return rows[0];
}

async function remover(id) {
  const r = await db.query('DELETE FROM etapa_regras WHERE id = $1', [id]);
  if (!r.rowCount) throw AppError.notFound('Regra não encontrada');
}

// ---- Execução ----

async function executarRegra(regra, os) {
  const p = regra.params || {};
  if (regra.acao === 'criar_retorno') {
    await retornos.criar({
      cliente_id: os.cliente_id,
      carro_id: os.carro_id,
      os_id: os.id,
      agendado_para: daquiADias(p.dias ?? 0),
      motivo: p.motivo || `OS nº ${os.numero_os} entrou em "${os.etapa_nome || 'etapa'}"`,
    });
  } else if (regra.acao === 'enfileirar_followup') {
    await followup.criarManual({
      cliente_id: os.cliente_id,
      carro_id: os.carro_id,
      tipo: p.tipo || 'manutencao',
      mensagem: p.mensagem || '',
      agendado_para: daquiADias(p.dias ?? 0),
    });
  }
}

/**
 * Roda as regras 'ao_entrar' ativas da etapa. Cada ação é isolada em
 * try/catch: uma automação que falha nunca derruba o move da OS.
 */
async function executarAoEntrar(etapaId, os) {
  const { rows } = await db.query(
    `SELECT * FROM etapa_regras
      WHERE etapa_id = $1 AND ativo AND gatilho = 'ao_entrar'`, [etapaId],
  );
  for (const regra of rows) {
    try {
      await executarRegra(regra, os);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`Regra de etapa ${regra.id} falhou: ${e.message}`);
    }
  }
}

module.exports = { listar, criar, atualizar, remover, executarAoEntrar };
