'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

async function listar({ pagina, por_pagina, busca }) {
  const params = [];
  let where = '';
  if (busca) {
    // Busca por placa: normaliza tirando hífen/espaço, uppercase. Termo com 3+
    // caracteres alfanuméricos vira LIKE parcial pra tolerar digitação incompleta.
    const placaNorm = busca.toUpperCase().replace(/[^A-Z0-9]/g, '');
    params.push(
      `%${busca}%`,
      busca.replace(/\D/g, '') || '-1',
      placaNorm.length >= 3 ? `${placaNorm}%` : '__nada__',
    );
    where = `WHERE nome ILIKE $1 OR telefone ILIKE $1 OR cpf_cnpj ILIKE $1
                OR numero_cliente::text = $2
                OR EXISTS (SELECT 1 FROM carros
                            WHERE cliente_id = c.id
                              AND upper(replace(placa,'-','')) LIKE $3)`;
  }
  // O total precisa usar o mesmo FROM `c` que o WHERE, senão o EXISTS não resolve.
  const total = await db.query(
    `SELECT count(*) FROM clientes c ${where}`, params,
  );

  params.push(por_pagina, (pagina - 1) * por_pagina);
  const { rows } = await db.query(
    `SELECT c.*,
            (SELECT count(*) FROM carros WHERE cliente_id = c.id)::int AS qtd_carros,
            (SELECT count(*) FROM ordens_servico WHERE cliente_id = c.id)::int AS qtd_os
       FROM clientes c ${where}
      ORDER BY c.numero_cliente DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const t = Number(total.rows[0].count);
  return { dados: rows, paginacao: { pagina, por_pagina, total: t, paginas: Math.ceil(t / por_pagina) } };
}

async function buscarPorId(id) {
  const { rows } = await db.query('SELECT * FROM clientes WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Cliente não encontrado');
  const carros = await db.query('SELECT * FROM carros WHERE cliente_id = $1 ORDER BY criado_em', [id]);
  return { ...rows[0], carros: carros.rows };
}

async function criar(d) {
  const { rows } = await db.query(
    `INSERT INTO clientes (nome, telefone, cpf_cnpj, email, endereco, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.nome, d.telefone, d.cpf_cnpj || null, d.email || null, d.endereco || null, d.observacoes || null],
  );
  return rows[0];
}

async function atualizar(id, d) {
  const campos = [];
  const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    params.push(v === '' ? null : v);
    campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE clientes SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw AppError.notFound('Cliente não encontrado');
  return rows[0];
}

async function remover(id) {
  // ON DELETE RESTRICT nas OS impede apagar cliente com histórico.
  const { rowCount } = await db.query('DELETE FROM clientes WHERE id = $1', [id]);
  if (!rowCount) throw AppError.notFound('Cliente não encontrado');
}

module.exports = { listar, buscarPorId, criar, atualizar, remover };
