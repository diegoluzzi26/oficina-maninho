'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');
const osService = require('./os.service');

/**
 * Agenda de serviços futuros.
 * Quando o carro chega, o agendamento vira OS via converterEmOS().
 * Isso desmembra a intenção (agenda) do registro fiscal (OS).
 */

async function comServicos(id) {
  const [ag, itens] = await Promise.all([
    db.query('SELECT * FROM vw_agendamentos WHERE id = $1', [id]),
    db.query('SELECT * FROM agendamento_servicos WHERE agendamento_id = $1 ORDER BY criado_em', [id]),
  ]);
  if (!ag.rows[0]) throw AppError.notFound('Agendamento não encontrado');
  return { ...ag.rows[0], servicos: itens.rows };
}

async function listarPorMes({ ano, mes, status }) {
  const hoje = new Date();
  const y = Number(ano) || hoje.getFullYear();
  const m = Number(mes) || hoje.getMonth() + 1;

  const inicio = `${y}-${String(m).padStart(2, '0')}-01`;
  const proxMes = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const params = [inicio, proxMes];
  let clause = 'data_agendada >= $1::date AND data_agendada < $2::date';
  if (status) { params.push(status); clause += ` AND status = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT * FROM vw_agendamentos WHERE ${clause} ORDER BY data_agendada`, params,
  );
  return { referencia: { ano: y, mes: m }, dados: rows };
}

async function listarPorDia(dataISO, { status } = {}) {
  const params = [dataISO];
  let clause = "date_trunc('day', data_agendada AT TIME ZONE 'America/Sao_Paulo') = $1::date";
  if (status) { params.push(status); clause += ` AND status = $${params.length}`; }

  const { rows } = await db.query(
    `SELECT * FROM vw_agendamentos WHERE ${clause} ORDER BY data_agendada`, params,
  );
  return rows;
}

async function buscarPorId(id) { return comServicos(id); }

/**
 * Cria agendamento com serviços numa transação.
 * `servicos`: [{ servico_id?, nome_servico }]. Se servico_id vier
 * mas nome_servico não, usa o nome do catálogo.
 */
async function criar(dados, userId) {
  const { cliente_id, carro_id, data_agendada, duracao_min,
          observacoes, servicos = [] } = dados;

  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO agendamentos (cliente_id, carro_id, data_agendada,
                                  duracao_min, observacoes, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [cliente_id, carro_id, data_agendada,
       duracao_min || 60, observacoes || null, userId || null],
    );
    const id = rows[0].id;

    for (const s of servicos) {
      let nome = s.nome_servico;
      if (s.servico_id && !nome) {
        const r = await client.query('SELECT nome FROM servicos WHERE id = $1', [s.servico_id]);
        if (!r.rows[0]) throw AppError.notFound(`Serviço ${s.servico_id} não encontrado`);
        nome = r.rows[0].nome;
      }
      if (!nome) throw new AppError('Cada serviço precisa de nome ou servico_id', 422);

      await client.query(
        `INSERT INTO agendamento_servicos (agendamento_id, servico_id, nome_servico)
         VALUES ($1, $2, $3)`,
        [id, s.servico_id || null, nome],
      );
    }
    return comServicos(id);
  });
}

async function atualizar(id, dados) {
  return db.withTransaction(async (client) => {
    const campos = []; const params = [];
    for (const [k, v] of Object.entries(dados)) {
      if (k === 'servicos' || v === undefined) continue;
      params.push(v); campos.push(`${k} = $${params.length}`);
    }

    if (campos.length) {
      params.push(id);
      const r = await client.query(
        `UPDATE agendamentos SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING id`,
        params,
      );
      if (!r.rowCount) throw AppError.notFound('Agendamento não encontrado');
    }

    // Se serviços foi enviado (mesmo vazio), substitui a lista atual.
    if (Array.isArray(dados.servicos)) {
      await client.query('DELETE FROM agendamento_servicos WHERE agendamento_id = $1', [id]);
      for (const s of dados.servicos) {
        let nome = s.nome_servico;
        if (s.servico_id && !nome) {
          const r = await client.query('SELECT nome FROM servicos WHERE id = $1', [s.servico_id]);
          nome = r.rows[0]?.nome;
        }
        if (!nome) continue;
        await client.query(
          `INSERT INTO agendamento_servicos (agendamento_id, servico_id, nome_servico)
           VALUES ($1,$2,$3)`, [id, s.servico_id || null, nome],
        );
      }
    }

    return comServicos(id);
  });
}

async function cancelar(id) {
  const r = await db.query(
    `UPDATE agendamentos SET status = 'cancelado'
       WHERE id = $1 AND status = 'agendado' RETURNING id`, [id],
  );
  if (!r.rowCount) {
    throw new AppError('Só é possível cancelar um agendamento que ainda está agendado', 422);
  }
  return comServicos(id);
}

async function remover(id) {
  const r = await db.query('DELETE FROM agendamentos WHERE id = $1', [id]);
  if (!r.rowCount) throw AppError.notFound('Agendamento não encontrado');
}

/**
 * Converte o agendamento em OS: cria a OS com os mesmos cliente/carro
 * e serviços (usando valor_padrao do catálogo como sugestão inicial),
 * marca o agendamento como 'concluido' e amarra os dois via os_id.
 */
async function converterEmOS(id, extras, userId) {
  const ag = await comServicos(id);
  if (ag.status !== 'agendado') {
    throw new AppError(`Agendamento já está ${ag.status}, não pode virar OS`, 422);
  }

  // Reaproveita a validação/regra do os.service.criar
  const os = await osService.criar({
    cliente_id: ag.cliente_id,
    carro_id: ag.carro_id,
    observacoes: [ag.observacoes, extras?.observacoes].filter(Boolean).join(' — ') || null,
    km_entrada: extras?.km_entrada ?? null,
    desconto: extras?.desconto ?? 0,
    servicos: ag.servicos.map((s) => ({
      servico_id: s.servico_id,
      nome_servico: s.nome_servico,
      quantidade: 1,
    })),
    pecas: [],
    notificar_whatsapp: false,
  }, userId);

  await db.query(
    `UPDATE agendamentos SET status = 'concluido', os_id = $1 WHERE id = $2`,
    [os.id, id],
  );

  return { agendamento: await comServicos(id), os };
}

module.exports = {
  listarPorMes, listarPorDia, buscarPorId,
  criar, atualizar, cancelar, remover, converterEmOS,
};
