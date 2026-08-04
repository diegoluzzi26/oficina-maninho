'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Marca vencidos como atrasados antes de qualquer leitura.
 * Feito na consulta em vez de cron: não depende de agendador rodando,
 * e o custo é desprezível (índice parcial sobre poucos registros).
 */
async function sincronizarAtrasos() {
  await db.query('SELECT atualizar_despesas_atrasadas()');
}

// ---------------------------------------------------------------- fornecedores

async function listarFornecedores({ busca, incluir_inativos } = {}) {
  const params = [];
  const where = [];
  if (!incluir_inativos) where.push('f.ativo = TRUE');
  if (busca) {
    params.push(`%${busca}%`);
    where.push(`(f.nome ILIKE $${params.length} OR f.cnpj_cpf ILIKE $${params.length}
                 OR f.contato ILIKE $${params.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT f.*,
            (SELECT count(*) FROM despesas WHERE fornecedor_id = f.id)::int AS qtd_despesas,
            (SELECT COALESCE(sum(valor),0) FROM despesas
              WHERE fornecedor_id = f.id AND status IN ('pendente','atrasada'))::numeric AS em_aberto
       FROM fornecedores f ${clause}
      ORDER BY f.nome`,
    params,
  );
  return rows.map((r) => ({ ...r, em_aberto: Number(r.em_aberto) }));
}

async function buscarFornecedor(id) {
  const { rows } = await db.query('SELECT * FROM fornecedores WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Fornecedor não encontrado');

  const despesas = await db.query(
    `SELECT * FROM vw_despesas WHERE fornecedor_id = $1
      ORDER BY COALESCE(vencimento, competencia) DESC LIMIT 20`, [id],
  );
  return { ...rows[0], despesas: despesas.rows };
}

async function criarFornecedor(d) {
  const { rows } = await db.query(
    `INSERT INTO fornecedores (nome, cnpj_cpf, telefone, email, endereco, contato, observacoes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.nome, d.cnpj_cpf || null, d.telefone || null, d.email || null,
      d.endereco || null, d.contato || null, d.observacoes || null],
  );
  return rows[0];
}

async function atualizarFornecedor(id, d) {
  const campos = [];
  const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    params.push(v === '' ? null : v);
    campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarFornecedor(id);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE fornecedores SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (!rows[0]) throw AppError.notFound('Fornecedor não encontrado');
  return rows[0];
}

async function desativarFornecedor(id) {
  const { rows } = await db.query(
    'UPDATE fornecedores SET ativo = FALSE WHERE id = $1 RETURNING *', [id],
  );
  if (!rows[0]) throw AppError.notFound('Fornecedor não encontrado');
  return rows[0];
}

// ---------------------------------------------------------------- categorias

/**
 * Lista categorias. Se `escopo` for informado, retorna as do escopo pedido
 * mais as marcadas como 'ambos'. Sem escopo, retorna tudo (usado no
 * gerenciamento em Configurações).
 * `incluir_inativas` só pra tela de gerenciamento.
 */
async function listarCategorias({ escopo, incluir_inativas } = {}) {
  const where = [];
  const params = [];
  if (!incluir_inativas) where.push('ativo');
  if (escopo) {
    params.push(escopo);
    where.push(`(escopo = $${params.length} OR escopo = 'ambos')`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT * FROM categorias_despesa ${clause} ORDER BY ordem, nome`,
    params,
  );
  return rows;
}

async function criarCategoria({ nome, cor, escopo, ordem }) {
  try {
    const { rows } = await db.query(
      `INSERT INTO categorias_despesa (nome, cor, escopo, ordem)
       VALUES ($1, $2, $3, COALESCE($4, 100))
       RETURNING *`,
      [nome, cor || '#64748b', escopo || 'ambos', ordem ?? null],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw AppError.conflict('Já existe categoria ativa com esse nome');
    throw err;
  }
}

async function atualizarCategoria(id, d) {
  const permitidos = ['nome', 'cor', 'escopo', 'ordem', 'ativo'];
  const campos = [];
  const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || !permitidos.includes(k)) continue;
    params.push(v);
    campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) {
    const { rows } = await db.query('SELECT * FROM categorias_despesa WHERE id = $1', [id]);
    if (!rows[0]) throw AppError.notFound('Categoria não encontrada');
    return rows[0];
  }
  params.push(id);
  try {
    const { rows } = await db.query(
      `UPDATE categorias_despesa SET ${campos.join(', ')}
        WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (!rows[0]) throw AppError.notFound('Categoria não encontrada');
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw AppError.conflict('Já existe categoria ativa com esse nome');
    throw err;
  }
}

/**
 * Hard-delete. FK de despesas e despesas_recorrentes é ON DELETE SET NULL,
 * então despesas antigas continuam existindo — só perdem a associação.
 */
async function excluirCategoria(id) {
  const { rows } = await db.query(
    'DELETE FROM categorias_despesa WHERE id = $1 RETURNING *',
    [id],
  );
  if (!rows[0]) throw AppError.notFound('Categoria não encontrada');
  return rows[0];
}

// ---------------------------------------------------------------- despesas

async function listarDespesas(f = {}) {
  await sincronizarAtrasos();

  const params = [];
  const where = [];

  // Escopo padrão é 'oficina' — aba pessoal tem que pedir explicitamente
  const escopo = f.escopo || 'oficina';
  params.push(escopo); where.push(`escopo = $${params.length}`);

  if (f.status) { params.push(f.status); where.push(`status = $${params.length}`); }
  if (f.categoria_id) { params.push(f.categoria_id); where.push(`categoria_id = $${params.length}`); }
  if (f.fornecedor_id) { params.push(f.fornecedor_id); where.push(`fornecedor_id = $${params.length}`); }
  if (f.forma) { params.push(f.forma); where.push(`forma = $${params.length}`); }

  // Só as que têm vencimento — é a aba "Boletos"
  if (f.somente_boletos) where.push('vencimento IS NOT NULL');

  // Janela mês-a-mês considera a vida útil da despesa: da competência até
  // o vencimento (ou até a própria competência se não for boleto). Assim,
  // um boleto lançado em maio com vencimento em julho aparece em maio,
  // junho e julho — some só depois de vencer.
  if (f.inicio) { params.push(f.inicio); where.push(`COALESCE(vencimento, competencia) >= $${params.length}::date`); }
  if (f.fim) { params.push(f.fim); where.push(`competencia <= $${params.length}::date`); }

  if (f.vence_ate) {
    params.push(f.vence_ate);
    where.push(`vencimento IS NOT NULL AND vencimento <= $${params.length}::date
                AND status IN ('pendente','atrasada')`);
  }
  if (f.busca) {
    params.push(`%${f.busca}%`);
    where.push(`(descricao ILIKE $${params.length} OR fornecedor_nome ILIKE $${params.length}
                 OR numero_doc ILIKE $${params.length})`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const pagina = f.pagina || 1;
  const porPagina = f.por_pagina || 50;

  const total = await db.query(`SELECT count(*) FROM vw_despesas ${clause}`, params);

  params.push(porPagina, (pagina - 1) * porPagina);
  const { rows } = await db.query(
    `SELECT * FROM vw_despesas ${clause}
      ORDER BY COALESCE(vencimento, competencia) DESC, criado_em DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const t = Number(total.rows[0].count);
  return {
    dados: rows.map(normalizar),
    paginacao: { pagina, por_pagina: porPagina, total: t, paginas: Math.ceil(t / porPagina) },
  };
}

const normalizar = (r) => ({
  ...r,
  valor: Number(r.valor),
  valor_pago: r.valor_pago === null ? null : Number(r.valor_pago),
});

async function buscarDespesa(id) {
  const { rows } = await db.query('SELECT * FROM vw_despesas WHERE id = $1', [id]);
  if (!rows[0]) throw AppError.notFound('Despesa não encontrada');
  return normalizar(rows[0]);
}

async function criarDespesa(d, userId) {
  const { rows } = await db.query(
    `INSERT INTO despesas
       (descricao, categoria_id, fornecedor_id, valor, forma, vencimento, competencia,
        status, pago_em, valor_pago, codigo_barras, numero_doc, observacoes, recorrente, escopo, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, date_trunc('month', now())::date),
             $8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [d.descricao, d.categoria_id || null, d.fornecedor_id || null, d.valor, d.forma,
      d.vencimento || null, d.competencia || null,
      d.status || 'pendente', d.pago_em || null, d.valor_pago ?? null,
      d.codigo_barras || null, d.numero_doc || null, d.observacoes || null,
      d.recorrente || false, d.escopo || 'oficina', userId || null],
  );
  return buscarDespesa(rows[0].id);
}

async function atualizarDespesa(id, d) {
  const permitidos = ['descricao', 'categoria_id', 'fornecedor_id', 'valor', 'forma',
    'vencimento', 'competencia', 'status', 'pago_em', 'valor_pago',
    'codigo_barras', 'numero_doc', 'observacoes', 'recorrente', 'escopo'];

  const campos = [];
  const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || !permitidos.includes(k)) continue;
    params.push(v === '' ? null : v);
    campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarDespesa(id);

  params.push(id);
  const { rows } = await db.query(
    `UPDATE despesas SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params,
  );
  if (!rows[0]) throw AppError.notFound('Despesa não encontrada');
  return buscarDespesa(id);
}

/** Baixa de pagamento: o trigger preenche data e valor se vierem vazios. */
async function pagarDespesa(id, { pago_em, valor_pago } = {}) {
  const { rows } = await db.query(
    `UPDATE despesas SET status='paga', pago_em=$2, valor_pago=$3
      WHERE id=$1 AND status <> 'cancelada' RETURNING id`,
    [id, pago_em || null, valor_pago ?? null],
  );
  if (!rows[0]) throw AppError.notFound('Despesa não encontrada ou cancelada');
  return buscarDespesa(id);
}

async function removerDespesa(id) {
  const { rowCount } = await db.query('DELETE FROM despesas WHERE id=$1', [id]);
  if (!rowCount) throw AppError.notFound('Despesa não encontrada');
}

// ---------------------------------------------------------------- alertas

/**
 * Despesas a vencer nos próximos N dias + as já atrasadas.
 * Alimenta o badge do menu e a tela de alertas.
 */
async function proximosVencimentos(dias = 7) {
  await sincronizarAtrasos();

  const { rows } = await db.query(
    `SELECT * FROM vw_despesas
      WHERE vencimento IS NOT NULL
        AND status IN ('pendente','atrasada')
        AND vencimento <= CURRENT_DATE + $1::int
      ORDER BY vencimento`,
    [dias],
  );
  const lista = rows.map(normalizar);

  return {
    atrasadas: lista.filter((d) => d.dias_para_vencer < 0),
    vence_hoje: lista.filter((d) => d.dias_para_vencer === 0),
    proximas: lista.filter((d) => d.dias_para_vencer > 0),
    total_em_aberto: lista.reduce((s, d) => s + d.valor, 0),
    quantidade: lista.length,
  };
}

/**
 * Painel de despesas pessoais — mesmo espírito de painelMes mas
 * SÓ despesas com escopo='pessoal', sem receita. Só o dono deve
 * enxergar (a rota exige admin).
 */
async function painelPessoal({ ano, mes } = {}) {
  const hoje = new Date();
  const y = Number(ano) || hoje.getUTCFullYear();
  const m = Number(mes) || hoje.getUTCMonth() + 1;
  const inicio = `${y}-${String(m).padStart(2, '0')}-01`;
  const proxMes = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const [resumoQ, catQ, formaQ] = await Promise.all([
    db.query(
      `SELECT COALESCE(sum(valor),0)::numeric AS total_previsto,
              COALESCE(sum(CASE WHEN status='paga' THEN COALESCE(valor_pago, valor) END),0)::numeric AS total_pago,
              count(*) FILTER (WHERE status='atrasada')::int AS qtd_atrasada,
              count(*) FILTER (WHERE status='pendente')::int AS qtd_pendente,
              count(*)::int AS qtd
         FROM despesas
        WHERE escopo = 'pessoal'
          AND competencia >= $1::date AND competencia < $2::date`,
      [inicio, proxMes],
    ),
    db.query(
      `SELECT cd.nome AS categoria, cd.cor,
              count(*)::int AS qtd,
              COALESCE(sum(d.valor),0)::numeric AS total
         FROM despesas d
         LEFT JOIN categorias_despesa cd ON cd.id = d.categoria_id
        WHERE d.escopo = 'pessoal'
          AND d.competencia >= $1::date AND d.competencia < $2::date
        GROUP BY cd.nome, cd.cor
        ORDER BY total DESC`,
      [inicio, proxMes],
    ),
    db.query(
      `SELECT forma, count(*)::int AS qtd,
              COALESCE(sum(COALESCE(valor_pago, valor)),0)::numeric AS total
         FROM despesas
        WHERE escopo = 'pessoal' AND status = 'paga'
          AND pago_em >= $1::date AND pago_em < $2::date
        GROUP BY forma
        ORDER BY total DESC`,
      [inicio, proxMes],
    ),
  ]);
  const r = resumoQ.rows[0];
  return {
    referencia: { ano: y, mes: m, inicio, fim: proxMes },
    total_previsto: Number(r.total_previsto),
    total_pago: Number(r.total_pago),
    qtd: r.qtd,
    qtd_pendente: r.qtd_pendente,
    qtd_atrasada: r.qtd_atrasada,
    por_categoria: catQ.rows.map((c) => ({ ...c, total: Number(c.total) })),
    por_forma: formaQ.rows.map((f) => ({ ...f, total: Number(f.total) })),
  };
}

module.exports = {
  sincronizarAtrasos,
  listarFornecedores, buscarFornecedor, criarFornecedor, atualizarFornecedor, desativarFornecedor,
  listarCategorias, criarCategoria, atualizarCategoria, excluirCategoria,
  listarDespesas, buscarDespesa, criarDespesa, atualizarDespesa, pagarDespesa, removerDespesa,
  proximosVencimentos, painelPessoal,
};
