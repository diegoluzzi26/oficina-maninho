'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Checklist de inspeção visual da OS.
 * Itens fixos por seção. Ao criar pela primeira vez, todos são inseridos
 * com estado NULL. O atendente marca depois OK / Atenção / Problema.
 */

const TEMPLATE = {
  internos: [
    'Cinto de segurança (todos)',
    'Freio de estacionamento',
    'Luzes do painel / indicadores',
    'Sistema de embreagem',
    'Acionamento das setas e alerta',
    'Buzina',
    'Limpador de para-brisa',
  ],
  externos: [
    'Faróis principais (baixo e alto)',
    'Luz de freio',
    'Luz de ré',
    'Setas dianteiras e traseiras',
    'Luz da placa',
    'Palhetas do limpador',
    'Estepe e macaco',
    'Etiqueta de segurança / adesivos',
  ],
  motor: [
    'Nível do óleo do motor',
    'Fluido de freio',
    'Água do radiador / arrefecimento',
    'Água do lavador de para-brisa',
    'Correias (dentada, acessórios)',
    'Escape (vazamento, ruído)',
    'Bateria (terminais, fixação)',
  ],
  inferiores: [
    'Estado dos pneus (desgaste, calibragem)',
    'Vazamentos (óleo, câmbio, freio)',
    'Amortecedores',
    'Escape (fixação)',
    'Sistema de freio (discos, pastilhas visíveis)',
  ],
};

async function garantirParaOS(osId, userId) {
  const os = await db.query('SELECT id, status FROM ordens_servico WHERE id = $1', [osId]);
  if (!os.rows[0]) throw AppError.notFound('OS não encontrada');
  if (os.rows[0].status === 'paga') {
    throw new AppError('OS paga: checklist não pode ser criado/alterado', 422);
  }

  return db.withTransaction(async (client) => {
    const ja = await client.query('SELECT id FROM os_checklists WHERE os_id = $1', [osId]);
    if (ja.rows[0]) return ja.rows[0].id;

    const ins = await client.query(
      `INSERT INTO os_checklists (os_id, criado_por) VALUES ($1, $2) RETURNING id`,
      [osId, userId || null],
    );
    const checklistId = ins.rows[0].id;

    for (const [secao, nomes] of Object.entries(TEMPLATE)) {
      for (let i = 0; i < nomes.length; i += 1) {
        await client.query(
          `INSERT INTO os_checklist_itens (checklist_id, secao, ordem, nome)
           VALUES ($1, $2, $3, $4)`,
          [checklistId, secao, i + 1, nomes[i]],
        );
      }
    }
    return checklistId;
  });
}

async function buscarPorOS(osId) {
  const c = await db.query('SELECT * FROM os_checklists WHERE os_id = $1', [osId]);
  if (!c.rows[0]) return null;
  const itens = await db.query(
    `SELECT id, secao, ordem, nome, estado, observacao
       FROM os_checklist_itens WHERE checklist_id = $1
      ORDER BY secao, ordem`, [c.rows[0].id]);
  return { ...c.rows[0], itens: itens.rows };
}

async function atualizarItem(itemId, { estado, observacao }) {
  const campos = []; const params = [];
  if (estado !== undefined)     { params.push(estado);     campos.push(`estado = $${params.length}`); }
  if (observacao !== undefined) { params.push(observacao); campos.push(`observacao = $${params.length}`); }
  if (!campos.length) return null;
  params.push(itemId);
  const r = await db.query(
    `UPDATE os_checklist_itens SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params);
  if (!r.rowCount) throw AppError.notFound('Item do checklist não encontrado');
  await db.query(
    `UPDATE os_checklists SET atualizado_em = now()
       WHERE id = (SELECT checklist_id FROM os_checklist_itens WHERE id = $1)`,
    [itemId]);
  return r.rows[0];
}

async function atualizarObservacaoGeral(osId, observacao_geral) {
  const r = await db.query(
    `UPDATE os_checklists SET observacao_geral = $1 WHERE os_id = $2 RETURNING *`,
    [observacao_geral || null, osId]);
  if (!r.rowCount) throw AppError.notFound('Checklist não encontrado');
  return r.rows[0];
}

module.exports = {
  TEMPLATE, garantirParaOS, buscarPorOS, atualizarItem, atualizarObservacaoGeral,
};
