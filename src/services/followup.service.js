'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');
const wa = require('./whatsapp.service');

/**
 * Módulo de follow-up ativo com o cliente.
 *
 * Fluxo:
 *  1) admin cadastra REGRAS (tipo + intervalo + template)
 *  2) admin clica "Gerar fila" → varredura popula followup_fila com pendentes
 *  3) atendente/admin abre a fila e dispara WhatsApp via wa.me (link)
 *  4) marca status conforme resposta do cliente (enviado/respondeu/converteu/dispensado)
 *
 * Deduplicação: um pendente por (cliente, carro, regra). Depois de
 * dispensar/converter, geração cria de novo.
 */

// ---------------------------------------------------------------- REGRAS

async function listarRegras({ ativo } = {}) {
  const params = []; const where = [];
  if (ativo === true)  { where.push('ativo = TRUE'); }
  if (ativo === false) { where.push('ativo = FALSE'); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT r.*, s.nome AS servico_nome
       FROM followup_regras r
       LEFT JOIN servicos s ON s.id = r.servico_id
       ${clause}
      ORDER BY r.ativo DESC, r.tipo, r.nome`, params,
  );
  return rows;
}

async function criarRegra(d) {
  if (d.tipo === 'manutencao' && !d.servico_id) {
    throw new AppError('Regra de manutenção precisa de servico_id', 422);
  }
  const { rows } = await db.query(
    `INSERT INTO followup_regras
       (nome, tipo, servico_id, intervalo_dias, mensagem_template, ativo)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6, TRUE))
     RETURNING *`,
    [d.nome, d.tipo, d.servico_id || null, d.intervalo_dias || 180,
      d.mensagem_template, d.ativo],
  );
  return rows[0];
}

async function atualizarRegra(id, d) {
  const permitidos = ['nome', 'tipo', 'servico_id', 'intervalo_dias',
    'mensagem_template', 'ativo'];
  const campos = []; const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined || !permitidos.includes(k)) continue;
    params.push(v === '' ? null : v);
    campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) {
    const { rows } = await db.query('SELECT * FROM followup_regras WHERE id=$1', [id]);
    if (!rows[0]) throw AppError.notFound('Regra não encontrada');
    return rows[0];
  }
  params.push(id);
  const { rows } = await db.query(
    `UPDATE followup_regras SET ${campos.join(', ')}
      WHERE id=$${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw AppError.notFound('Regra não encontrada');
  return rows[0];
}

async function removerRegra(id) {
  // Soft delete: desativa. Regras usadas em followup_fila continuam
  // referenciadas via FK ON DELETE SET NULL.
  const { rows } = await db.query(
    `UPDATE followup_regras SET ativo=FALSE WHERE id=$1 RETURNING *`, [id],
  );
  if (!rows[0]) throw AppError.notFound('Regra não encontrada');
  return rows[0];
}

// ---------------------------------------------------------------- FILA

async function listarFila({ status, tipo, de, ate, busca, pagina = 1, por_pagina = 30 } = {}) {
  const params = []; const where = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (tipo)   { params.push(tipo);   where.push(`tipo = $${params.length}`); }
  if (de)     { params.push(de);     where.push(`agendado_para >= $${params.length}::date`); }
  if (ate)    { params.push(ate);    where.push(`agendado_para <= $${params.length}::date`); }
  if (busca)  {
    params.push(`%${busca}%`);
    where.push(`(cliente_nome ILIKE $${params.length}
                 OR upper(replace(placa,'-','')) LIKE upper(replace($${params.length},'-','')))`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await db.query(`SELECT count(*) FROM vw_followup_fila ${clause}`, params);

  const porPagina = Math.min(por_pagina, 100);
  params.push(porPagina, (pagina - 1) * porPagina);
  const { rows } = await db.query(
    `SELECT * FROM vw_followup_fila ${clause}
       ORDER BY agendado_para ASC, criado_em DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params,
  );
  const t = Number(total.rows[0].count);
  return {
    dados: rows,
    paginacao: { pagina, por_pagina: porPagina, total: t, paginas: Math.ceil(t / porPagina) },
  };
}

async function buscarItem(id) {
  const { rows } = await db.query('SELECT * FROM vw_followup_fila WHERE id=$1', [id]);
  if (!rows[0]) throw AppError.notFound('Follow-up não encontrado');
  return rows[0];
}

async function criarManual(d, userId) {
  const { rows } = await db.query(
    `INSERT INTO followup_fila
       (cliente_id, carro_id, tipo, mensagem, agendado_para, criado_por)
     VALUES ($1,$2,$3,$4,$5::date,$6)
     RETURNING *`,
    [d.cliente_id, d.carro_id || null, d.tipo, d.mensagem,
      d.agendado_para || new Date().toISOString().slice(0, 10), userId || null],
  );
  await registrarHistorico(rows[0].id, 'criado_manual', userId, d.notas);
  return buscarItem(rows[0].id);
}

async function mudarStatus(id, { status, notas, os_id }, userId) {
  const setExtra = [];
  const params = [status];
  if (status === 'enviado') setExtra.push('enviado_em = now()');
  if (status === 'respondeu' || status === 'converteu') {
    setExtra.push('respondido_em = COALESCE(respondido_em, now())');
  }
  if (status === 'converteu' && os_id) {
    params.push(os_id);
    setExtra.push(`convertido_os_id = $${params.length}`);
  }
  if (notas) {
    params.push(notas);
    setExtra.push(`notas = $${params.length}`);
  }
  params.push(id);
  const { rows } = await db.query(
    `UPDATE followup_fila SET status=$1
       ${setExtra.length ? ', ' + setExtra.join(', ') : ''}
      WHERE id=$${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw AppError.notFound('Follow-up não encontrado');
  await registrarHistorico(id, status, userId, notas);
  return buscarItem(id);
}

async function reagendar(id, { agendado_para, notas }, userId) {
  const { rows } = await db.query(
    `UPDATE followup_fila SET agendado_para=$1::date,
       notas = COALESCE($2, notas), status='pendente'
      WHERE id=$3 RETURNING *`,
    [agendado_para, notas || null, id],
  );
  if (!rows[0]) throw AppError.notFound('Follow-up não encontrado');
  await registrarHistorico(id, 'reagendado', userId, notas);
  return buscarItem(id);
}

async function removerItem(id) {
  const { rowCount } = await db.query('DELETE FROM followup_fila WHERE id=$1', [id]);
  if (!rowCount) throw AppError.notFound('Follow-up não encontrado');
}

async function registrarHistorico(fila_id, acao, usuario_id, notas) {
  await db.query(
    `INSERT INTO followup_historico (fila_id, acao, usuario_id, notas)
     VALUES ($1,$2,$3,$4)`,
    [fila_id, acao, usuario_id || null, notas || null],
  );
}

// ---------------------------------------------------------------- ENVIO AUTO

/**
 * Envia via Evolution API a mensagem já pronta do follow-up.
 * No sucesso, marca como 'enviado' e registra histórico.
 * No fracasso, NÃO muda o status (fica pendente pra retentar).
 */
async function enviarAgora(id, userId) {
  const item = await buscarItem(id);
  if (!item.cliente_telefone) {
    throw new AppError('Cliente sem telefone cadastrado', 422);
  }
  if (item.status === 'enviado' || item.status === 'respondeu' || item.status === 'converteu') {
    throw new AppError('Follow-up já foi enviado', 409);
  }

  const resposta = await wa.notificar({
    telefone: item.cliente_telefone,
    mensagem: item.mensagem,
    cliente_id: item.cliente_id,
  });

  await db.query(
    `UPDATE followup_fila
        SET status='enviado', enviado_em=now()
      WHERE id=$1`, [id],
  );
  await registrarHistorico(id, 'enviado_automatico', userId,
    resposta?.wa_message_id ? `wa_message_id=${resposta.wa_message_id}` : null);

  return buscarItem(id);
}

/**
 * Enfileira envios para todos os pendentes com agendado_para <= hoje.
 * Retorna contagem de sucessos e falhas.
 */
async function enviarPendentesAgora(userId) {
  const { rows } = await db.query(
    `SELECT id FROM followup_fila
      WHERE status='pendente' AND agendado_para <= CURRENT_DATE
      ORDER BY agendado_para ASC, criado_em ASC
      LIMIT 100`,
  );

  let enviados = 0;
  const falhas = [];
  for (const r of rows) {
    try {
      await enviarAgora(r.id, userId);
      enviados += 1;
    } catch (err) {
      falhas.push({ id: r.id, motivo: err.message });
    }
  }
  return { total: rows.length, enviados, falhas };
}

// ---------------------------------------------------------------- GERAR

/**
 * Renderiza {nome_cliente}, {modelo_carro}, {placa}, {servico}, {dias_desde}
 * a partir do row bruto vindo do SELECT. Vars ausentes viram string vazia.
 */
function renderizar(template, ctx) {
  return template
    .replace(/\{nome_cliente\}/g, ctx.nome_cliente || '')
    .replace(/\{modelo_carro\}/g, ctx.modelo_carro || '')
    .replace(/\{placa\}/g, ctx.placa || '')
    .replace(/\{servico\}/g, ctx.servico || '')
    .replace(/\{dias_desde\}/g, ctx.dias_desde ?? '');
}

async function gerarFila({ regra_id } = {}, userId) {
  const regras = regra_id
    ? (await db.query('SELECT * FROM followup_regras WHERE id=$1 AND ativo', [regra_id])).rows
    : (await db.query('SELECT * FROM followup_regras WHERE ativo').then((r) => r.rows));

  let gerados = 0;

  for (const regra of regras) {
    let candidatos = [];
    if (regra.tipo === 'manutencao' && regra.servico_id) {
      candidatos = (await db.query(
        `SELECT DISTINCT ON (c.id, ca.id)
                c.id AS cliente_id, c.nome AS nome_cliente, c.telefone,
                ca.id AS carro_id, ca.marca, ca.modelo, ca.placa,
                os.id AS os_origem_id, oss.nome_servico AS servico,
                COALESCE(os.paga_em, os.fechada_em)::date AS data_servico,
                (CURRENT_DATE - COALESCE(os.paga_em, os.fechada_em)::date)::int AS dias_desde
           FROM clientes c
           JOIN carros ca         ON ca.cliente_id = c.id
           JOIN ordens_servico os ON os.carro_id = ca.id AND os.status IN ('paga','finalizada')
           JOIN os_servicos oss   ON oss.os_id = os.id AND oss.servico_id = $1
          WHERE COALESCE(os.paga_em, os.fechada_em)::date <= CURRENT_DATE - ($2 || ' days')::interval
            AND c.telefone IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM followup_fila ff
               WHERE ff.cliente_id = c.id
                 AND COALESCE(ff.carro_id::text,'') = COALESCE(ca.id::text,'')
                 AND ff.regra_id = $3
                 AND ff.status IN ('pendente','enviado')
                 AND ff.criado_em > now() - interval '30 days'
            )
          ORDER BY c.id, ca.id, COALESCE(os.paga_em, os.fechada_em) DESC`,
        [regra.servico_id, regra.intervalo_dias, regra.id],
      )).rows;
    } else if (regra.tipo === 'reativacao') {
      candidatos = (await db.query(
        `WITH ultima AS (
           SELECT o.cliente_id, MAX(COALESCE(o.paga_em, o.fechada_em))::date AS ultima_visita
             FROM ordens_servico o
            WHERE o.status IN ('paga','finalizada')
            GROUP BY o.cliente_id
         )
         SELECT c.id AS cliente_id, c.nome AS nome_cliente, c.telefone,
                NULL::uuid AS carro_id, ''::text AS marca, ''::text AS modelo, ''::text AS placa,
                NULL::uuid AS os_origem_id, ''::text AS servico,
                u.ultima_visita AS data_servico,
                (CURRENT_DATE - u.ultima_visita)::int AS dias_desde
           FROM clientes c
           JOIN ultima u ON u.cliente_id = c.id
          WHERE c.telefone IS NOT NULL
            AND u.ultima_visita <= CURRENT_DATE - ($1 || ' days')::interval
            AND NOT EXISTS (
              SELECT 1 FROM followup_fila ff
               WHERE ff.cliente_id = c.id
                 AND ff.regra_id = $2
                 AND ff.status IN ('pendente','enviado')
                 AND ff.criado_em > now() - interval '30 days'
            )`,
        [regra.intervalo_dias, regra.id],
      )).rows;
    } else if (regra.tipo === 'avaliacao') {
      // N dias após qualquer OS paga/finalizada. Usa a OS mais recente
      // do cliente pra gerar 1 follow-up por atendimento.
      candidatos = (await db.query(
        `SELECT DISTINCT ON (os.cliente_id)
                c.id AS cliente_id, c.nome AS nome_cliente, c.telefone,
                ca.id AS carro_id, ca.marca, ca.modelo, ca.placa,
                os.id AS os_origem_id, ''::text AS servico,
                COALESCE(os.paga_em, os.fechada_em)::date AS data_servico,
                (CURRENT_DATE - COALESCE(os.paga_em, os.fechada_em)::date)::int AS dias_desde
           FROM ordens_servico os
           JOIN clientes c ON c.id = os.cliente_id
           JOIN carros ca  ON ca.id = os.carro_id
          WHERE os.status IN ('paga','finalizada')
            AND COALESCE(os.paga_em, os.fechada_em)::date <= CURRENT_DATE - ($1 || ' days')::interval
            AND COALESCE(os.paga_em, os.fechada_em)::date >= CURRENT_DATE - (($1::int + 30) || ' days')::interval
            AND c.telefone IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM followup_fila ff
               WHERE ff.cliente_id = c.id
                 AND ff.regra_id = $2
                 AND ff.os_origem_id = os.id
            )
          ORDER BY os.cliente_id, COALESCE(os.paga_em, os.fechada_em) DESC`,
        [regra.intervalo_dias, regra.id],
      )).rows;
    } else if (regra.tipo === 'promocao') {
      // Sugestão: clientes ativos (com OS nos últimos 18 meses) ainda não
      // contactados por essa regra. O admin refina depois na UI.
      candidatos = (await db.query(
        `SELECT DISTINCT c.id AS cliente_id, c.nome AS nome_cliente, c.telefone,
                (SELECT ca2.id  FROM carros ca2 WHERE ca2.cliente_id=c.id ORDER BY ca2.criado_em DESC LIMIT 1) AS carro_id,
                COALESCE((SELECT ca2.marca  FROM carros ca2 WHERE ca2.cliente_id=c.id ORDER BY ca2.criado_em DESC LIMIT 1),'') AS marca,
                COALESCE((SELECT ca2.modelo FROM carros ca2 WHERE ca2.cliente_id=c.id ORDER BY ca2.criado_em DESC LIMIT 1),'') AS modelo,
                COALESCE((SELECT ca2.placa  FROM carros ca2 WHERE ca2.cliente_id=c.id ORDER BY ca2.criado_em DESC LIMIT 1),'') AS placa,
                NULL::uuid AS os_origem_id, ''::text AS servico,
                CURRENT_DATE::date AS data_servico, 0 AS dias_desde
           FROM clientes c
          WHERE c.telefone IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM ordens_servico o
               WHERE o.cliente_id = c.id
                 AND o.aberta_em >= now() - interval '18 months'
            )
            AND NOT EXISTS (
              SELECT 1 FROM followup_fila ff
               WHERE ff.cliente_id = c.id
                 AND ff.regra_id = $1
                 AND ff.status <> 'dispensado'
            )
          LIMIT 200`,
        [regra.id],
      )).rows;
    }

    for (const cand of candidatos) {
      const mensagem = renderizar(regra.mensagem_template, {
        nome_cliente: cand.nome_cliente,
        modelo_carro: [cand.marca, cand.modelo].filter(Boolean).join(' ').trim(),
        placa: cand.placa,
        servico: cand.servico,
        dias_desde: cand.dias_desde,
      });
      try {
        const inserido = await db.query(
          `INSERT INTO followup_fila
             (cliente_id, carro_id, regra_id, os_origem_id, tipo, mensagem, criado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [cand.cliente_id, cand.carro_id, regra.id, cand.os_origem_id,
            regra.tipo, mensagem, userId || null],
        );
        await registrarHistorico(inserido.rows[0].id, 'criado_automatico', userId);
        gerados += 1;
      } catch (e) {
        // Duplicado (índice único) → ignora silenciosamente
        if (!/duplicate|unique/i.test(e.message)) throw e;
      }
    }
  }

  return { gerados };
}

// ---------------------------------------------------------------- MÉTRICAS

async function metricas({ periodo = 30 } = {}) {
  const p = Number(periodo) || 30;
  const [totalQ, tipoQ, hojeQ] = await Promise.all([
    db.query(
      `SELECT
         count(*)::int AS total_gerados,
         count(*) FILTER (WHERE status IN ('enviado','respondeu','converteu'))::int AS enviados,
         count(*) FILTER (WHERE status IN ('respondeu','converteu'))::int AS responderam,
         count(*) FILTER (WHERE status = 'converteu')::int AS converteram
       FROM followup_fila
       WHERE criado_em >= now() - ($1 || ' days')::interval`,
      [p],
    ),
    db.query(
      `SELECT tipo,
              count(*)::int AS gerados,
              count(*) FILTER (WHERE status IN ('enviado','respondeu','converteu'))::int AS enviados,
              count(*) FILTER (WHERE status = 'converteu')::int AS converteram
         FROM followup_fila
         WHERE criado_em >= now() - ($1 || ' days')::interval
         GROUP BY tipo`,
      [p],
    ),
    db.query(
      `SELECT count(*)::int AS pendentes_hoje
         FROM followup_fila
        WHERE status = 'pendente' AND agendado_para <= CURRENT_DATE`,
    ),
  ]);

  const t = totalQ.rows[0];
  const enviados = Number(t.enviados);
  return {
    total_gerados: Number(t.total_gerados),
    enviados,
    responderam: Number(t.responderam),
    converteram: Number(t.converteram),
    taxa_resposta: enviados ? Number(((Number(t.responderam) / enviados) * 100).toFixed(1)) : 0,
    taxa_conversao: enviados ? Number(((Number(t.converteram) / enviados) * 100).toFixed(1)) : 0,
    por_tipo: Object.fromEntries(tipoQ.rows.map((r) => [r.tipo, {
      gerados: Number(r.gerados), enviados: Number(r.enviados), converteram: Number(r.converteram),
    }])),
    pendentes_hoje: Number(hojeQ.rows[0].pendentes_hoje),
  };
}

// ---------------------------------------------------------------- KANBAN

/**
 * Mapeia os 5 status internos pras 4 colunas do kanban da UI:
 *   pendente  -> a-fazer
 *   enviado   -> enviado
 *   respondeu -> em-conversa
 *   converteu -> fechado (badge: convertido)
 *   dispensado-> fechado (badge: dispensado)
 */
const COLUNA_POR_STATUS = {
  pendente:   'a-fazer',
  enviado:    'enviado',
  respondeu:  'em-conversa',
  converteu:  'fechado',
  dispensado: 'fechado',
};

/**
 * Retorna 4 colunas já com os cards dentro + contagem por tipo (pra
 * alimentar os chips de filtro). Tudo em uma requisição só.
 *
 * Filtros opcionais:
 *   tipo    — 'manutencao' | 'reativacao' | 'promocao' | 'avaliacao'
 *   busca   — nome do cliente ou placa
 */
async function kanban({ tipo, busca } = {}) {
  const params = [];
  const where = [];
  if (tipo) { params.push(tipo); where.push(`tipo = $${params.length}`); }
  if (busca) {
    params.push(`%${busca}%`);
    where.push(`(cliente_nome ILIKE $${params.length}
                 OR upper(replace(placa,'-','')) LIKE upper(replace($${params.length},'-','')))`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT * FROM vw_followup_fila ${clause}
      ORDER BY
        CASE status
          WHEN 'pendente' THEN 1 WHEN 'enviado' THEN 2
          WHEN 'respondeu' THEN 3 WHEN 'converteu' THEN 4 ELSE 5
        END,
        agendado_para ASC, criado_em DESC
      LIMIT 500`, params,
  );

  // Agrupa por coluna do kanban
  const colunas = {
    'a-fazer':     [],
    'enviado':     [],
    'em-conversa': [],
    'fechado':     [],
  };
  for (const item of rows) {
    const col = COLUNA_POR_STATUS[item.status] || 'fechado';
    colunas[col].push(item);
  }

  // Contagem por tipo pros chips (SEMPRE em cima do total, ignora o
  // filtro de tipo — o chip clicado ainda deve mostrar seu contador).
  const contagemQ = await db.query(
    `SELECT tipo, count(*)::int AS qtd
       FROM vw_followup_fila ${busca ? clause.replace(/AND tipo = \$1/, '') : ''}
       GROUP BY tipo`,
    busca ? params.slice(tipo ? 1 : 0) : [],
  );
  const porTipo = {
    manutencao: 0, reativacao: 0, promocao: 0, avaliacao: 0,
  };
  let total = 0;
  for (const r of contagemQ.rows) {
    porTipo[r.tipo] = r.qtd;
    total += r.qtd;
  }

  return {
    colunas,
    contagens: { todos: total, ...porTipo },
    totais: {
      'a-fazer':     colunas['a-fazer'].length,
      'enviado':     colunas['enviado'].length,
      'em-conversa': colunas['em-conversa'].length,
      'fechado':     colunas['fechado'].length,
    },
  };
}

/**
 * Histórico completo de follow-ups de um cliente (todos os tipos,
 * todos os status, ordenados do mais recente pro mais antigo).
 * Alimenta o modal "Ver histórico" no card do kanban.
 */
async function historicoDoCliente(clienteId) {
  const { rows } = await db.query(
    `SELECT f.id, f.tipo, f.status, f.mensagem,
            f.agendado_para, f.enviado_em, f.respondido_em,
            f.criado_em, f.notas,
            r.nome AS regra_nome,
            o.numero_os AS convertido_os_numero
       FROM followup_fila f
       LEFT JOIN followup_regras r ON r.id = f.regra_id
       LEFT JOIN ordens_servico o  ON o.id = f.convertido_os_id
      WHERE f.cliente_id = $1
      ORDER BY GREATEST(
        COALESCE(f.respondido_em, '1970-01-01'::timestamptz),
        COALESCE(f.enviado_em,    '1970-01-01'::timestamptz),
        f.criado_em
      ) DESC
      LIMIT 100`, [clienteId],
  );

  // Também busca o nome do cliente pra o cabeçalho do modal
  const cli = await db.query('SELECT nome FROM clientes WHERE id = $1', [clienteId]);

  return {
    cliente: cli.rows[0] || null,
    historico: rows,
  };
}

module.exports = {
  listarRegras, criarRegra, atualizarRegra, removerRegra,
  listarFila, buscarItem, criarManual, mudarStatus, reagendar, removerItem,
  gerarFila, metricas,
  enviarAgora, enviarPendentesAgora,
  kanban, historicoDoCliente,
};
