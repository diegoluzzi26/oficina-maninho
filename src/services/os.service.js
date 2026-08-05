'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Se o item veio como `servico_id`, apenas retorna esse id.
 * Se veio só `nome_servico`, procura no catálogo (case-insensitive):
 *   - Encontrou → reusa o id.
 *   - Não encontrou → cria com o valor_unit como valor_padrao.
 *
 * Ideia: o usuário nunca precisa "cadastrar antes de usar" — bate o
 * nome e o catálogo cresce sozinho conforme a oficina atende.
 */
async function garantirServicoNoCatalogo(client, item) {
  if (item.servico_id) return item.servico_id;

  const nome = (item.nome_servico || '').trim();
  if (!nome) return null;

  const existe = await client.query(
    'SELECT id FROM servicos WHERE lower(nome) = lower($1) AND ativo',
    [nome],
  );
  if (existe.rows[0]) return existe.rows[0].id;

  const criado = await client.query(
    `INSERT INTO servicos (nome, valor_padrao)
     VALUES ($1, $2) RETURNING id`,
    [nome, Number(item.valor_unit) || 0],
  );
  return criado.rows[0].id;
}

/**
 * Mesmo padrão pra peças. Como o backend antigo só tinha `descricao`
 * texto livre nas OS, aqui é onde o catálogo de peças ganha vida.
 */
async function garantirPecaNoCatalogo(client, item) {
  if (item.peca_id) return item.peca_id;

  const nome = (item.descricao || '').trim();
  if (!nome) return null;

  const existe = await client.query(
    'SELECT id FROM pecas WHERE lower(nome) = lower($1) AND ativo',
    [nome],
  );
  if (existe.rows[0]) return existe.rows[0].id;

  const criado = await client.query(
    `INSERT INTO pecas (nome, valor_padrao)
     VALUES ($1, $2) RETURNING id`,
    [nome, Number(item.valor_unit) || 0],
  );
  return criado.rows[0].id;
}

const SELECT_OS = `
  SELECT o.*,
         c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.numero_cliente,
         ca.placa, ca.marca, ca.modelo, ca.ano, ca.cor, ca.cambio,
         u.nome AS criado_por_nome,
         (SELECT a.id FROM os_anexos a
           WHERE a.os_id = o.id AND a.mime LIKE 'image/%'
           ORDER BY a.criado_em ASC LIMIT 1) AS foto_id
    FROM ordens_servico o
    JOIN clientes c ON c.id = o.cliente_id
    JOIN carros  ca ON ca.id = o.carro_id
    LEFT JOIN users u ON u.id = o.criado_por
`;

async function comItens(client, os) {
  const q = client || db;
  const [servicos, pecas] = await Promise.all([
    q.query('SELECT * FROM os_servicos WHERE os_id = $1 ORDER BY criado_em', [os.id]),
    q.query('SELECT * FROM os_pecas    WHERE os_id = $1 ORDER BY criado_em', [os.id]),
  ]);
  return { ...os, servicos: servicos.rows, pecas: pecas.rows };
}

async function buscarPorId(id) {
  const { rows } = await db.query(`${SELECT_OS} WHERE o.id = $1`, [id]);
  if (!rows[0]) throw AppError.notFound('Ordem de serviço não encontrada');
  return comItens(null, rows[0]);
}

async function listar({ pagina, por_pagina, status, cliente_id, busca, ano, mes,
                         marca, forma_pagamento }) {
  const where = [];
  const params = [];

  if (status)     { params.push(status);     where.push(`o.status = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); where.push(`o.cliente_id = $${params.length}`); }
  if (marca)      { params.push(marca);      where.push(`lower(ca.marca) = lower($${params.length})`); }
  if (forma_pagamento) {
    params.push(forma_pagamento);
    where.push(`o.forma_pagamento = $${params.length}`);
  }
  if (ano && mes) {
    // Regra especial: quando o filtro é o MÊS ATUAL, traz também OSs
    // antigas ainda em aberto (aberta/em_andamento) — elas ficam
    // pendentes na tela até fecharem. Meses históricos ficam com
    // corte estrito por aberta_em.
    const hoje = new Date();
    const eMesAtual = Number(ano) === hoje.getFullYear()
      && Number(mes) === hoje.getMonth() + 1;
    if (eMesAtual) {
      params.push(ano, mes);
      where.push(`(
        (date_part('year', o.aberta_em) = $${params.length - 1}
         AND date_part('month', o.aberta_em) = $${params.length})
        OR (
          o.status IN ('aberta','em_andamento')
          AND o.aberta_em < make_date($${params.length - 1}::int, $${params.length}::int, 1)
        )
      )`);
    } else {
      params.push(ano, mes);
      where.push(`date_part('year',  o.aberta_em) = $${params.length - 1}
               AND date_part('month', o.aberta_em) = $${params.length}`);
    }
  }
  if (busca) {
    params.push(`%${busca}%`);
    where.push(`(c.nome ILIKE $${params.length} OR ca.placa ILIKE $${params.length}
                 OR o.numero_os::text = $${params.length + 1})`);
    params.push(busca.replace(/\D/g, '') || '-1');
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await db.query(
    `SELECT count(*) FROM ordens_servico o
       JOIN clientes c ON c.id=o.cliente_id JOIN carros ca ON ca.id=o.carro_id ${clause}`,
    params,
  );

  params.push(por_pagina, (pagina - 1) * por_pagina);
  const { rows } = await db.query(
    `${SELECT_OS} ${clause} ORDER BY o.aberta_em DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    dados: rows,
    paginacao: {
      pagina, por_pagina,
      total: Number(total.rows[0].count),
      paginas: Math.ceil(Number(total.rows[0].count) / por_pagina),
    },
  };
}

/**
 * Cria OS com serviços e peças numa única transação.
 * Se qualquer item falhar, nada é gravado — evita OS órfã sem itens.
 *
 * Cliente inline: se vier `novo_cliente` no lugar de `cliente_id`, cria o
 * cliente (e opcionalmente o primeiro carro via `novo_carro`) antes da OS.
 */
async function criar(dados, userId) {
  let { cliente_id, carro_id } = dados;
  const { km_entrada, observacoes, desconto, servicos, pecas,
          novo_cliente, novo_carro } = dados;

  return db.withTransaction(async (client) => {
    if (!cliente_id && novo_cliente) {
      const c = await client.query(
        `INSERT INTO clientes (nome, telefone, cpf_cnpj, email, endereco, observacoes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [novo_cliente.nome, novo_cliente.telefone,
         novo_cliente.cpf_cnpj || null, novo_cliente.email || null,
         novo_cliente.endereco || null, novo_cliente.observacoes || null],
      );
      cliente_id = c.rows[0].id;
    }

    if (!carro_id && novo_carro) {
      const ca = await client.query(
        `INSERT INTO carros (cliente_id, placa, marca, modelo, ano, cor, km_atual, chassi)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [cliente_id, novo_carro.placa, novo_carro.marca, novo_carro.modelo,
         novo_carro.ano || null, novo_carro.cor || null,
         novo_carro.km_atual || null, novo_carro.chassi || null],
      );
      carro_id = ca.rows[0].id;
    }

    if (!cliente_id) throw new AppError('Informe cliente_id ou novo_cliente', 422);
    if (!carro_id)   throw new AppError('Informe carro_id ou novo_carro', 422);

    const { rows } = await client.query(
      `INSERT INTO ordens_servico (cliente_id, carro_id, km_entrada, observacoes, desconto, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [cliente_id, carro_id, km_entrada ?? null, observacoes ?? null, desconto ?? 0, userId ?? null],
    );
    const os = rows[0];

    for (const item of servicos) {
      let nome = item.nome_servico;
      let valor = item.valor_unit;

      if (item.servico_id) {
        const s = await client.query(
          'SELECT nome, valor_padrao FROM servicos WHERE id = $1', [item.servico_id],
        );
        if (!s.rows[0]) throw AppError.notFound(`Serviço ${item.servico_id} não encontrado`);
        nome = nome || s.rows[0].nome;
        valor = valor ?? Number(s.rows[0].valor_padrao);
      }
      if (valor === undefined || valor === null) {
        throw new AppError(`Informe o valor do serviço "${nome}"`, 422);
      }
      // Garante que o item vira entrada de catálogo (cria se não existe)
      const servicoId = await garantirServicoNoCatalogo(client,
        { ...item, nome_servico: nome, valor_unit: valor });

      await client.query(
        `INSERT INTO os_servicos (os_id, servico_id, nome_servico, quantidade, valor_unit)
         VALUES ($1,$2,$3,$4,$5)`,
        [os.id, servicoId, nome, item.quantidade, valor],
      );
    }

    for (const p of pecas) {
      const pecaId = await garantirPecaNoCatalogo(client, p);
      await client.query(
        `INSERT INTO os_pecas (os_id, peca_id, descricao, quantidade, valor_unit)
         VALUES ($1,$2,$3,$4,$5)`,
        [os.id, pecaId, p.descricao, p.quantidade, p.valor_unit],
      );
    }

    // Recarrega: os totais foram recalculados pelos triggers
    const final = await client.query(`${SELECT_OS} WHERE o.id = $1`, [os.id]);
    return comItens(client, final.rows[0]);
  });
}

async function atualizar(id, dados) {
  const permitidos = ['km_entrada', 'observacoes', 'desconto',
    'valor_pago', 'paga_em', 'forma_pagamento'];
  // A UI mandava `pago_em` (por espelhar despesas), mas a coluna real
  // se chama `paga_em`. Normaliza aqui para não vazar o detalhe.
  const dadosNorm = { ...dados };
  if (dadosNorm.pago_em !== undefined && dadosNorm.paga_em === undefined) {
    dadosNorm.paga_em = dadosNorm.pago_em;
  }
  delete dadosNorm.pago_em;

  const campos = [];
  const params = [];
  for (const [k, v] of Object.entries(dadosNorm)) {
    if (v === undefined || !permitidos.includes(k)) continue;
    params.push(v === '' ? null : v);
    campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);

  params.push(id);
  const { rows } = await db.query(
    `UPDATE ordens_servico SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params,
  );
  if (!rows[0]) throw AppError.notFound('Ordem de serviço não encontrada');
  return buscarPorId(id);
}

const TRANSICOES = {
  aberta: ['em_andamento', 'finalizada'],
  em_andamento: ['finalizada', 'aberta'],
  finalizada: ['paga', 'em_andamento'],
  paga: [],
};

async function mudarStatus(id, novo, dadosPagamento = {}) {
  const atual = await db.query('SELECT status, valor_total FROM ordens_servico WHERE id = $1', [id]);
  if (!atual.rows[0]) throw AppError.notFound('Ordem de serviço não encontrada');

  const de = atual.rows[0].status;
  if (de === novo) return buscarPorId(id);

  if (!TRANSICOES[de].includes(novo)) {
    throw new AppError(
      `Não é possível mudar o status de "${de}" para "${novo}"`
      + (de === 'paga' ? '. Uma OS paga não pode ser reaberta.' : ''),
      422,
    );
  }

  // Ao pagar, exigimos forma. Data e valor têm defaults sensatos.
  if (novo === 'paga') {
    const { forma_pagamento, pago_em, valor_pago } = dadosPagamento;
    if (!forma_pagamento) {
      throw new AppError('Informe a forma de pagamento para dar baixa na OS', 422);
    }
    await db.query(
      `UPDATE ordens_servico
          SET status = $1,
              forma_pagamento = $2,
              paga_em  = COALESCE($3::timestamptz, now()),
              valor_pago = COALESCE($4, valor_total)
        WHERE id = $5`,
      [novo, forma_pagamento, pago_em || null, valor_pago ?? null, id],
    );
  } else {
    await db.query('UPDATE ordens_servico SET status = $1 WHERE id = $2', [novo, id]);
  }
  return buscarPorId(id);
}

async function adicionarServico(osId, item) {
  return db.withTransaction(async (client) => {
    let { nome_servico: nome, valor_unit: valor } = item;

    if (item.servico_id) {
      const s = await client.query('SELECT nome, valor_padrao FROM servicos WHERE id=$1', [item.servico_id]);
      if (!s.rows[0]) throw AppError.notFound('Serviço não encontrado');
      nome = nome || s.rows[0].nome;
      valor = valor ?? Number(s.rows[0].valor_padrao);
    }
    if (valor === undefined || valor === null) throw new AppError('Informe o valor do serviço', 422);

    const servicoId = await garantirServicoNoCatalogo(client,
      { ...item, nome_servico: nome, valor_unit: valor });

    await client.query(
      `INSERT INTO os_servicos (os_id, servico_id, nome_servico, quantidade, valor_unit)
       VALUES ($1,$2,$3,$4,$5)`,
      [osId, servicoId, nome, item.quantidade, valor],
    );

    const { rows } = await client.query(`${SELECT_OS} WHERE o.id = $1`, [osId]);
    return comItens(client, rows[0]);
  });
}

async function adicionarPeca(osId, peca) {
  return db.withTransaction(async (client) => {
    const pecaId = await garantirPecaNoCatalogo(client, peca);
    await client.query(
      `INSERT INTO os_pecas (os_id, peca_id, descricao, quantidade, valor_unit)
       VALUES ($1,$2,$3,$4,$5)`,
      [osId, pecaId, peca.descricao, peca.quantidade, peca.valor_unit],
    );
    const { rows } = await client.query(`${SELECT_OS} WHERE o.id = $1`, [osId]);
    return comItens(client, rows[0]);
  });
}

async function removerServico(osId, itemId) {
  const r = await db.query('DELETE FROM os_servicos WHERE id=$1 AND os_id=$2', [itemId, osId]);
  if (!r.rowCount) throw AppError.notFound('Item não encontrado nesta OS');
  return buscarPorId(osId);
}

async function removerPeca(osId, itemId) {
  const r = await db.query('DELETE FROM os_pecas WHERE id=$1 AND os_id=$2', [itemId, osId]);
  if (!r.rowCount) throw AppError.notFound('Peça não encontrada nesta OS');
  return buscarPorId(osId);
}

/**
 * Apaga a OS por inteiro (junto com os_servicos, os_pecas, os_anexos
 * via ON DELETE CASCADE). Bloqueia se já foi paga — nesse caso é
 * registro fiscal e só admite ser "corrigida", não removida.
 */
async function remover(osId) {
  const { rows } = await db.query('SELECT numero_os FROM ordens_servico WHERE id=$1', [osId]);
  if (!rows[0]) throw AppError.notFound('Ordem de serviço não encontrada');
  await db.query('DELETE FROM ordens_servico WHERE id=$1', [osId]);
  return { removida: true, numero_os: rows[0].numero_os };
}

module.exports = {
  listar, buscarPorId, criar, atualizar, mudarStatus,
  adicionarServico, adicionarPeca, removerServico, removerPeca,
  remover,
};
