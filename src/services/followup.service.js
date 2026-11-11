'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');
const wa = require('./whatsapp.service');
const assinatura = require('./assinatura.service');

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

async function listarFila({ status, tipo, regra_id, de, ate, busca, pagina = 1, por_pagina = 30 } = {}) {
  const params = []; const where = [];
  if (status)   { params.push(status);   where.push(`status = $${params.length}`); }
  if (tipo)     { params.push(tipo);     where.push(`tipo = $${params.length}`); }
  if (regra_id) { params.push(regra_id); where.push(`regra_id = $${params.length}`); }
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
  // Mudança manual de status resolve qualquer envio "em conferência".
  const setExtra = ['envio_iniciado_em = NULL'];
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
       , ${setExtra.join(', ')}
      WHERE id=$${params.length} RETURNING *`, params,
  );
  if (!rows[0]) throw AppError.notFound('Follow-up não encontrado');
  await registrarHistorico(id, status, userId, notas);
  return buscarItem(id);
}

async function reagendar(id, { agendado_para, notas }, userId) {
  const { rows } = await db.query(
    `UPDATE followup_fila SET agendado_para=$1::date,
       notas = COALESCE($2, notas), status='pendente', envio_iniciado_em=NULL
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
 *
 * Antes de chamar a Evolution, trava o item (`envio_iniciado_em`), para que
 * dois cliques ou dois lotes nunca mandem a mesma mensagem duas vezes.
 *  - sucesso                         → 'enviado'
 *  - Evolution recusou               → solta a trava (pode tentar de novo)
 *  - Evolution não respondeu a tempo → a mensagem PODE ter saído: mantém a
 *    trava e `conferirEnvios` confirma na Evolution depois.
 */
async function enviarAgora(id, userId) {
  const item = await buscarItem(id);
  if (!item.cliente_telefone) {
    throw new AppError('Cliente sem telefone cadastrado', 422);
  }
  if (item.status !== 'pendente') {
    throw new AppError('Follow-up já foi enviado', 409);
  }

  const trava = await db.query(
    `UPDATE followup_fila SET envio_iniciado_em = now()
      WHERE id = $1 AND status = 'pendente' AND envio_iniciado_em IS NULL
      RETURNING id`, [id],
  );
  if (!trava.rowCount) {
    throw new AppError('Este follow-up já está sendo enviado. Aguarde a confirmação.', 409);
  }

  let resposta;
  try {
    resposta = await wa.notificar({
      telefone: item.cliente_telefone,
      mensagem: item.mensagem,
      cliente_id: item.cliente_id,
    });
  } catch (err) {
    if (err.envioIncerto) {
      await registrarHistorico(id, 'envio_incerto', userId, err.message);
      const e = new AppError(
        'O WhatsApp demorou para responder e a mensagem pode ter saído. '
        + 'O sistema confere sozinho em alguns minutos; não reenvie.', 504,
      );
      e.envioIncerto = true;
      throw e;
    }
    await db.query('UPDATE followup_fila SET envio_iniciado_em = NULL WHERE id = $1', [id]);
    throw err;
  }

  await db.query(
    `UPDATE followup_fila
        SET status='enviado', enviado_em=now(), envio_iniciado_em=NULL
      WHERE id=$1`, [id],
  );
  await registrarHistorico(id, 'enviado_automatico', userId,
    resposta?.wa_message_id ? `wa_message_id=${resposta.wa_message_id}` : null);

  return buscarItem(id);
}

// ---------------------------------------------------------------- LOTE

/**
 * Envio em lote roda em SEGUNDO PLANO, uma mensagem por vez com intervalo
 * (rajada de mensagens é o jeito mais rápido de o WhatsApp bloquear o
 * número). A tela acompanha por `estadoLote()`. Um lote por oficina.
 *
 * Estado em memória: se a api reiniciar no meio, o lote para; os itens já
 * travados são resolvidos por `conferirEnvios` e os demais seguem pendentes.
 */
const lotes = new Map(); // slug -> estado

function intervaloEntreEnvios() {
  const base = Number(process.env.FOLLOWUP_LOTE_INTERVALO_MS ?? 10000);
  return base > 0 ? base + Math.floor(Math.random() * (base / 2)) : 0;
}

const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });

function estadoLote() {
  const e = lotes.get(db.slugAtual());
  return e ? { ...e, falhas: [...e.falhas] } : null;
}

/**
 * Inicia o lote com os pendentes até hoje (opcionalmente só `ids` e/ou
 * `regra_id`). Itens já travados ficam de fora. Retorna o estado inicial;
 * o envio continua depois que a resposta HTTP já saiu.
 */
async function enviarPendentesAgora(userId, { ids, regra_id, regra_ids } = {}) {
  const slug = db.slugAtual();
  if (lotes.get(slug)?.em_andamento) {
    throw new AppError('Já existe um envio em lote em andamento. Aguarde terminar.', 409);
  }

  const params = [];
  const filtros = [];
  if (Array.isArray(ids) && ids.length > 0) {
    params.push(ids);
    filtros.push(`AND id = ANY($${params.length}::uuid[])`);
  }
  if (regra_id) {
    params.push(regra_id);
    filtros.push(`AND regra_id = $${params.length}`);
  }
  if (Array.isArray(regra_ids)) {
    params.push(regra_ids);
    filtros.push(`AND regra_id = ANY($${params.length}::uuid[])`);
  }
  const { rows } = await db.query(
    `SELECT id, cliente_nome FROM vw_followup_fila
      WHERE status='pendente' AND agendado_para <= CURRENT_DATE
        AND envio_iniciado_em IS NULL
        ${filtros.join(' ')}
      ORDER BY agendado_para ASC, criado_em ASC
      LIMIT 100`, params,
  );

  const estado = {
    total: rows.length, processados: 0, enviados: 0, incertos: 0, falhas: [],
    em_andamento: rows.length > 0,
    iniciado_em: new Date().toISOString(),
    concluido_em: rows.length ? null : new Date().toISOString(),
  };
  lotes.set(slug, estado);

  if (rows.length) {
    db.runComOficina(slug, async () => {
      for (let i = 0; i < rows.length; i += 1) {
        if (i > 0) await esperar(intervaloEntreEnvios());
        try {
          await enviarAgora(rows[i].id, userId);
          estado.enviados += 1;
        } catch (err) {
          if (err.envioIncerto) estado.incertos += 1;
          else estado.falhas.push({ id: rows[i].id, cliente: rows[i].cliente_nome, motivo: err.message });
        }
        estado.processados += 1;
      }
    }).catch((err) => {
      console.error(`[followup-lote] ${slug}: falha —`, err.message);
    }).finally(() => {
      estado.em_andamento = false;
      estado.concluido_em = new Date().toISOString();
    });
  }

  return estadoLote();
}

// ---------------------------------------------------------------- CONFERÊNCIA

const normalizarTexto = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/**
 * Confere na Evolution se mensagens de follow-up saíram e acerta o status.
 *
 *  padrão         → itens travados há 2+ min (envio que deu timeout).
 *                   Achou a mensagem → 'enviado'. Não achou e a trava tem
 *                   30+ min → solta a trava (volta a ser pendente normal).
 *  todosPendentes → TODOS os pendentes até hoje, procurando a mensagem
 *                   desde a criação do item. Acerta envios que saíram antes
 *                   desta correção e ficaram como pendentes.
 */
async function conferirEnvios({ todosPendentes = false } = {}, userId) {
  const where = todosPendentes
    ? `status = 'pendente' AND agendado_para <= CURRENT_DATE`
    : `status = 'pendente' AND envio_iniciado_em IS NOT NULL
       AND envio_iniciado_em < now() - interval '2 minutes'`;
  const { rows } = await db.query(
    `SELECT id, cliente_telefone, mensagem, criado_em, envio_iniciado_em,
            COALESCE(envio_iniciado_em < now() - interval '30 minutes', FALSE) AS trava_vencida
       FROM vw_followup_fila
      WHERE ${where} AND cliente_telefone IS NOT NULL
      ORDER BY agendado_para ASC, criado_em ASC
      LIMIT 300`,
  );

  const r = { conferidos: rows.length, confirmados: 0, liberados: 0, erros: 0 };
  for (const item of rows) {
    const desde = item.envio_iniciado_em
      ? new Date(new Date(item.envio_iniciado_em).getTime() - 5 * 60000)
      : new Date(item.criado_em);
    let enviadas;
    try {
      enviadas = await wa.enviadasPara(item.cliente_telefone, desde);
    } catch (err) {
      r.erros += 1;
      if (r.erros === 1) console.error('[followup-conferir] Evolution:', err.message);
      continue;
    }
    const alvo = normalizarTexto(item.mensagem);
    const achou = enviadas.find((m) => normalizarTexto(m.texto) === alvo);
    if (achou) {
      const up = await db.query(
        `UPDATE followup_fila
            SET status='enviado', enviado_em=$2, envio_iniciado_em=NULL
          WHERE id=$1 AND status='pendente'`, [item.id, achou.em],
      );
      if (up.rowCount) {
        await registrarHistorico(item.id, 'envio_confirmado', userId,
          achou.id ? `wa_message_id=${achou.id}` : null);
        r.confirmados += 1;
      }
    } else if (item.envio_iniciado_em && item.trava_vencida) {
      await db.query(
        `UPDATE followup_fila SET envio_iniciado_em=NULL
          WHERE id=$1 AND status='pendente'`, [item.id],
      );
      await registrarHistorico(item.id, 'envio_nao_confirmado', userId);
      r.liberados += 1;
    }
  }
  return r;
}

// ---------------------------------------------------------------- AUTOMAÇÕES

/**
 * Quatro automações fixas (uma regra com `chave` cada):
 *   revisao     — retornos da agenda (serviços/peças com intervalo no
 *                 catálogo) entram na fila `antecedencia_dias` antes de vencer
 *   pos_servico — `intervalo_dias` depois de uma OS paga/finalizada
 *   reativacao  — cliente sem OS há `intervalo_dias`
 *   campanha    — só sob demanda (montarCampanha): clientes atendidos nos
 *                 últimos `intervalo_dias`
 * Regras sem chave (de antes da unificação) não geram mais nada.
 */
const AUTOMACOES = ['revisao', 'pos_servico', 'reativacao', 'campanha'];

const VARIAVEIS = ['nome_cliente', 'modelo_carro', 'placa', 'servico', 'dias_desde', 'oficina'];

async function nomeOficina() {
  const slug = db.slugAtual();
  if (!slug) return '';
  const { rows } = await db.pool.query('SELECT nome FROM oficinas WHERE slug = $1', [slug]);
  return rows[0]?.nome || '';
}

/** Troca {variavel} pelo valor; variável ausente vira texto vazio. */
function renderizar(template, ctx) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) => (
    VARIAVEIS.includes(k) ? String(ctx[k] ?? '') : m
  ));
}

/** Texto e prazos padrão de cada cartão (mesmos da migration 052). */
const PADRAO_AUTOMACOES = [
  ['revisao', 'Revisão', 'manutencao', 180, true,
    'Olá {nome_cliente}! Aqui é da {oficina}.\n\nEstá chegando a hora de {servico} do seu {modelo_carro} ({placa}). Quer agendar? É só responder aqui.'],
  ['pos_servico', 'Pós-serviço', 'avaliacao', 3, false,
    'Olá {nome_cliente}! Aqui é da {oficina}. Obrigado pela confiança!\n\nFicou tudo certo com o {modelo_carro}? Se puder, conta pra gente como foi o atendimento.'],
  ['reativacao', 'Reativação', 'reativacao', 270, false,
    'Olá {nome_cliente}! Aqui é da {oficina}. Faz um tempo que não te vemos por aqui.\n\nSe o carro precisar de alguma coisa, é só chamar.'],
  ['campanha', 'Campanha', 'promocao', 545, false,
    'Olá {nome_cliente}! Aqui é da {oficina}.\n\n'],
];

/**
 * Garante os quatro cartões na oficina atual. Oficinas novas nascem do
 * clone da estrutura, sem dados — sem isto o follow-up delas não gerava nada.
 */
async function garantirAutomacoes() {
  for (const [chave, nome, tipo, dias, ativo, msg] of PADRAO_AUTOMACOES) {
    await db.query(
      `INSERT INTO followup_regras (nome, tipo, chave, intervalo_dias, mensagem_template, ativo)
       SELECT $1, $2::followup_tipo, $3, $4, $5, $6
        WHERE NOT EXISTS (SELECT 1 FROM followup_regras WHERE chave = $3)
       ON CONFLICT DO NOTHING`,
      [nome, tipo, chave, dias, msg, ativo],
    );
  }
}

/**
 * Automações criadas pela oficina (regras sem chave, com `gatilho`).
 * O tipo da fila vem do gatilho: é ele que decide se a mensagem pendente
 * é dispensada quando o cliente volta antes (revisão/reativação).
 */
const GATILHOS = {
  servico_feito: 'manutencao',
  sumido: 'reativacao',
  aniversario: 'promocao',
  campanha: 'promocao',
};

const COLUNAS_AUTOMACAO = `
  r.id, r.chave, r.gatilho, r.nome, r.tipo, r.ativo, r.intervalo_dias, r.antecedencia_dias,
  r.mensagem_template, r.filtros, r.envio_automatico, r.atualizado_em,
  (SELECT count(*)::int FROM followup_fila f
    WHERE f.regra_id = r.id AND f.criado_em >= now() - interval '30 days') AS gerados_30d`;

async function buscarAutomacao(ref) {
  const porId = /^[0-9a-f-]{36}$/i.test(String(ref));
  const { rows } = await db.query(
    `SELECT ${COLUNAS_AUTOMACAO} FROM followup_regras r
      WHERE ${porId ? 'r.id = $1::uuid' : 'r.chave = $1'}`, [ref],
  );
  if (!rows[0]) throw AppError.notFound('Automação não encontrada');
  return rows[0];
}

async function listarAutomacoes() {
  await garantirAutomacoes();
  const { rows } = await db.query(
    `SELECT ${COLUNAS_AUTOMACAO} FROM followup_regras r
      WHERE r.chave = ANY($1) OR (r.chave IS NULL AND r.gatilho IS NOT NULL)
      ORDER BY r.criado_em`, [AUTOMACOES],
  );
  const porChave = Object.fromEntries(rows.filter((r) => r.chave).map((r) => [r.chave, r]));
  const [catalogo, servicos, pecas] = await Promise.all([
    db.query(
      `SELECT (SELECT count(*)::int FROM servicos WHERE intervalo_retorno_meses IS NOT NULL) AS servicos,
              (SELECT count(*)::int FROM pecas    WHERE intervalo_retorno_meses IS NOT NULL) AS pecas`,
    ),
    db.query('SELECT id, nome FROM servicos WHERE ativo ORDER BY nome'),
    db.query('SELECT id, nome FROM pecas WHERE ativo ORDER BY nome'),
  ]);
  return {
    automacoes: AUTOMACOES.map((k) => porChave[k]).filter(Boolean),
    personalizadas: rows.filter((r) => !r.chave),
    catalogo_com_intervalo: catalogo.rows[0],
    catalogo: { servicos: servicos.rows, pecas: pecas.rows },
    oficina: await nomeOficina(),
    variaveis: VARIAVEIS,
  };
}

/** Filtros de carro: valem para qualquer automação própria. */
function filtrosDeCarro(f = {}) {
  const out = {};
  if (f.marca) out.marca = f.marca;
  if (f.modelo) out.modelo = f.modelo;
  if (f.ano_min) out.ano_min = f.ano_min;
  if (f.ano_max) out.ano_max = f.ano_max;
  if (f.cambios?.length) out.cambios = f.cambios;
  return out;
}

/** Só guarda os filtros que o gatilho usa; servico_feito exige ao menos um item. */
function limparFiltros(gatilho, f = {}) {
  const carro = filtrosDeCarro(f);
  if (gatilho === 'servico_feito') {
    const out = { ...carro, servico_ids: f.servico_ids || [], peca_ids: f.peca_ids || [] };
    if (!out.servico_ids.length && !out.peca_ids.length) {
      throw new AppError('Escolha pelo menos um serviço ou peça', 422);
    }
    return out;
  }
  if (gatilho === 'campanha') {
    const out = { ...carro };
    if (f.servico_ids?.length) out.servico_ids = f.servico_ids;
    if (f.visita && f.visita !== 'qualquer') {
      out.visita = f.visita;
      out.visita_dias = f.visita_dias || 180;
    }
    return out;
  }
  return carro;
}

async function criarAutomacao(d) {
  const filtros = limparFiltros(d.gatilho, d.filtros);
  const { rows } = await db.query(
    `INSERT INTO followup_regras
       (nome, tipo, gatilho, intervalo_dias, mensagem_template, filtros, ativo, envio_automatico)
     VALUES ($1, $2::followup_tipo, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING id`,
    [d.nome, GATILHOS[d.gatilho], d.gatilho, d.intervalo_dias || 30, d.mensagem_template,
      JSON.stringify(filtros), d.ativo ?? true, d.envio_automatico ?? false],
  );
  return buscarAutomacao(rows[0].id);
}

/** `ref` = chave de um cartão fixo ou id de uma automação própria. */
async function atualizarAutomacao(ref, d) {
  await garantirAutomacoes();
  const atual = await buscarAutomacao(ref);
  const editaveis = ['ativo', 'intervalo_dias', 'antecedencia_dias', 'mensagem_template', 'envio_automatico'];
  if (atual.gatilho) editaveis.push('nome', 'filtros');
  const campos = []; const params = [];
  for (const k of editaveis) {
    if (d[k] === undefined) continue;
    const valor = k === 'filtros' ? JSON.stringify(limparFiltros(atual.gatilho, d.filtros)) : d[k];
    params.push(valor);
    campos.push(`${k} = $${params.length}${k === 'filtros' ? '::jsonb' : ''}`);
  }
  if (!campos.length) throw new AppError('Nada para atualizar', 422);
  params.push(atual.id);
  await db.query(
    `UPDATE followup_regras SET ${campos.join(', ')} WHERE id = $${params.length}`, params,
  );
  return buscarAutomacao(atual.id);
}

/**
 * Apaga uma automação própria. O que ela já colocou na fila e ainda não
 * saiu é apagado junto; o que já foi enviado fica no histórico.
 */
async function removerAutomacao(id) {
  const atual = await buscarAutomacao(id);
  if (!atual.gatilho) throw AppError.notFound('Automação não encontrada'); // cartão fixo: só desliga
  const { rowCount } = await db.query(
    `DELETE FROM followup_fila
      WHERE regra_id = $1 AND status = 'pendente' AND envio_iniciado_em IS NULL`, [atual.id],
  );
  await db.query('DELETE FROM followup_regras WHERE id = $1', [atual.id]);
  return { removida: true, pendentes_apagados: rowCount };
}

// ---------------------------------------------------------------- GERAR

/** Candidatos de cada automação, já no formato de inserção. */
const CANDIDATOS = {
  // Retornos pendentes vencendo em até `antecedencia_dias` (e não muito
  // atrasados: o que venceu há mais de 60 dias fica de fora). Pula retorno
  // que já tem um mais novo do mesmo serviço/peça no mesmo carro — o
  // cliente já voltou e fez de novo.
  revisao: (regra) => db.query(
    `SELECT r.id AS retorno_id, r.cliente_id, c.nome AS nome_cliente,
            r.carro_id, ca.marca, ca.modelo, ca.placa, r.os_id AS os_origem_id,
            COALESCE(s.nome, r.nome_servico, r.motivo, 'a revisão') AS servico,
            (CURRENT_DATE - COALESCE(o.paga_em, o.fechada_em, r.criado_em)::date)::int AS dias_desde
       FROM retornos r
       JOIN clientes c       ON c.id = r.cliente_id
       LEFT JOIN carros ca   ON ca.id = r.carro_id
       LEFT JOIN servicos s  ON s.id = r.servico_id
       LEFT JOIN ordens_servico o ON o.id = r.os_id
      WHERE r.status = 'pendente'
        AND r.agendado_para <= CURRENT_DATE + ($1::int || ' days')::interval
        AND r.agendado_para >= CURRENT_DATE - interval '60 days'
        AND c.telefone IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM followup_fila f WHERE f.retorno_id = r.id)
        AND NOT EXISTS (
          SELECT 1 FROM retornos r2
           WHERE r2.cliente_id = r.cliente_id
             AND r2.carro_id IS NOT DISTINCT FROM r.carro_id
             AND COALESCE(r2.servico_id::text, r2.nome_servico) = COALESCE(r.servico_id::text, r.nome_servico)
             AND r2.criado_em > r.criado_em
        )
      ORDER BY r.agendado_para
      LIMIT 300`, [regra.antecedencia_dias],
  ),

  pos_servico: (regra) => db.query(
    `SELECT DISTINCT ON (os.cliente_id)
            c.id AS cliente_id, c.nome AS nome_cliente,
            ca.id AS carro_id, ca.marca, ca.modelo, ca.placa,
            os.id AS os_origem_id, ''::text AS servico,
            (CURRENT_DATE - COALESCE(os.paga_em, os.fechada_em)::date)::int AS dias_desde
       FROM ordens_servico os
       JOIN clientes c ON c.id = os.cliente_id
       JOIN carros ca  ON ca.id = os.carro_id
      WHERE os.status IN ('paga','finalizada')
        AND COALESCE(os.paga_em, os.fechada_em)::date <= CURRENT_DATE - ($1::int || ' days')::interval
        AND COALESCE(os.paga_em, os.fechada_em)::date >= CURRENT_DATE - (($1::int + 30) || ' days')::interval
        AND c.telefone IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM followup_fila ff
           WHERE ff.os_origem_id = os.id AND ff.regra_id = $2
        )
      ORDER BY os.cliente_id, COALESCE(os.paga_em, os.fechada_em) DESC`,
    [regra.intervalo_dias, regra.id],
  ),

  reativacao: (regra) => db.query(
    `WITH ultima AS (
       SELECT o.cliente_id, MAX(COALESCE(o.paga_em, o.fechada_em, o.aberta_em))::date AS ultima_visita
         FROM ordens_servico o
        WHERE o.status <> 'negada'
        GROUP BY o.cliente_id
     )
     SELECT c.id AS cliente_id, c.nome AS nome_cliente,
            NULL::uuid AS carro_id, ''::text AS marca, ''::text AS modelo, ''::text AS placa,
            NULL::uuid AS os_origem_id, ''::text AS servico,
            (CURRENT_DATE - u.ultima_visita)::int AS dias_desde
       FROM clientes c
       JOIN ultima u ON u.cliente_id = c.id
      WHERE c.telefone IS NOT NULL
        AND u.ultima_visita <= CURRENT_DATE - ($1::int || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM followup_fila ff
           WHERE ff.cliente_id = c.id AND ff.tipo = 'reativacao'
             AND ff.criado_em > u.ultima_visita
        )
      LIMIT 300`,
    [regra.intervalo_dias],
  ),

  // Campanha: clientes atendidos nos últimos `intervalo_dias`, com o carro
  // mais recente, sem campanha nos últimos 30 dias.
  campanha: (regra) => db.query(
    `SELECT c.id AS cliente_id, c.nome AS nome_cliente,
            ca.id AS carro_id, COALESCE(ca.marca,'') AS marca, COALESCE(ca.modelo,'') AS modelo,
            COALESCE(ca.placa,'') AS placa, NULL::uuid AS os_origem_id, ''::text AS servico,
            0 AS dias_desde
       FROM clientes c
       LEFT JOIN LATERAL (
         SELECT id, marca, modelo, placa FROM carros WHERE cliente_id = c.id
          ORDER BY criado_em DESC LIMIT 1
       ) ca ON TRUE
      WHERE c.telefone IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM ordens_servico o
           WHERE o.cliente_id = c.id
             AND o.aberta_em >= now() - ($1::int || ' days')::interval
        )
        AND NOT EXISTS (
          SELECT 1 FROM followup_fila ff
           WHERE ff.cliente_id = c.id AND ff.tipo = 'promocao'
             AND ff.criado_em > now() - interval '30 days'
        )
      ORDER BY c.nome
      LIMIT 500`,
    [regra.intervalo_dias],
  ),
};

/**
 * Condições de carro (marca, modelo, ano, câmbio) já com placeholders.
 * Empurra os valores em `params`. `p` = prefixo da coluna ('' dentro da
 * lateral de carros, 'ca.' quando o carro vem da OS).
 */
function condicoesCarro(f = {}, params, p = '') {
  const c = [];
  const add = (v, sql) => { params.push(v); c.push(sql.replace('$?', `$${params.length}`)); };
  if (f.marca) add(`%${f.marca}%`, `AND ${p}marca ILIKE $?`);
  if (f.modelo) add(`%${f.modelo}%`, `AND ${p}modelo ILIKE $?`);
  if (f.ano_min) add(f.ano_min, `AND ${p}ano >= $?`);
  if (f.ano_max) add(f.ano_max, `AND ${p}ano <= $?`);
  if (f.cambios?.length) add(f.cambios, `AND ${p}cambio::text = ANY($?::text[])`);
  return c.join(' ');
}

/**
 * Carro do cliente: o mais recente que passa no filtro. Com filtro de
 * carro, cliente sem carro que bata fica de fora (exigirCarro).
 */
const carroDoCliente = (cond = '') => `
  LEFT JOIN LATERAL (
    SELECT id, marca, modelo, placa FROM carros
     WHERE cliente_id = c.id ${cond}
     ORDER BY criado_em DESC LIMIT 1
  ) ca ON TRUE`;
const exigirCarro = (cond) => (cond ? 'AND ca.id IS NOT NULL' : '');

/** Público da campanha com filtros. Devolve { sql, params }. */
function consultaCampanha(regra) {
  const f = regra.filtros || {};
  const params = [regra.id];
  const condCarro = condicoesCarro(f, params);
  const where = [exigirCarro(condCarro)];
  if (f.servico_ids?.length) {
    params.push(f.servico_ids);
    where.push(`AND EXISTS (
      SELECT 1 FROM ordens_servico o JOIN os_servicos s ON s.os_id = o.id
       WHERE o.cliente_id = c.id AND o.status <> 'negada' AND s.servico_id = ANY($${params.length}::uuid[]))`);
  }
  if (f.visita === 'recente' || f.visita === 'sumido') {
    params.push(f.visita_dias || 180);
    const ultima = `(SELECT MAX(COALESCE(o.paga_em, o.fechada_em, o.aberta_em)) FROM ordens_servico o
                      WHERE o.cliente_id = c.id AND o.status <> 'negada')`;
    where.push(f.visita === 'recente'
      ? `AND ${ultima} >= now() - ($${params.length}::int || ' days')::interval`
      : `AND ${ultima} < now() - ($${params.length}::int || ' days')::interval`);
  }
  return {
    sql: `SELECT c.id AS cliente_id, c.nome AS nome_cliente,
                 ca.id AS carro_id, COALESCE(ca.marca,'') AS marca, COALESCE(ca.modelo,'') AS modelo,
                 COALESCE(ca.placa,'') AS placa, NULL::uuid AS os_origem_id, ''::text AS servico,
                 0 AS dias_desde
            FROM clientes c
            ${carroDoCliente(condCarro)}
           WHERE c.ativo AND c.telefone IS NOT NULL
             ${where.join('\n')}
             AND NOT EXISTS (
               SELECT 1 FROM followup_fila ff
                WHERE ff.cliente_id = c.id AND ff.regra_id = $1
                  AND ff.criado_em > now() - interval '30 days')
           ORDER BY c.nome
           LIMIT 500`,
    params,
  };
}

/** Candidatos das automações próprias, pelo gatilho. */
const CANDIDATOS_GATILHO = {
  // OS paga/finalizada há `intervalo_dias` (janela de 30 dias) que teve
  // algum dos serviços/peças escolhidos. Uma mensagem por OS. O filtro de
  // carro olha o carro da OS.
  servico_feito: (regra) => {
    const f = regra.filtros || {};
    const params = [regra.intervalo_dias, f.servico_ids || [], f.peca_ids || [], regra.id];
    const condCarro = condicoesCarro(f, params, 'ca.');
    return db.query(
      `SELECT c.id AS cliente_id, c.nome AS nome_cliente,
              ca.id AS carro_id, ca.marca, ca.modelo, ca.placa,
              os.id AS os_origem_id,
              COALESCE((SELECT string_agg(DISTINCT x.nome, ', ') FROM (
                  SELECT s.nome_servico AS nome FROM os_servicos s
                   WHERE s.os_id = os.id AND s.servico_id = ANY($2::uuid[])
                  UNION
                  SELECT p.descricao FROM os_pecas p
                   WHERE p.os_id = os.id AND p.peca_id = ANY($3::uuid[])
                ) x), '') AS servico,
              (CURRENT_DATE - COALESCE(os.paga_em, os.fechada_em)::date)::int AS dias_desde
         FROM ordens_servico os
         JOIN clientes c     ON c.id = os.cliente_id
         LEFT JOIN carros ca ON ca.id = os.carro_id
        WHERE os.status IN ('paga','finalizada')
          AND COALESCE(os.paga_em, os.fechada_em)::date <= CURRENT_DATE - ($1::int || ' days')::interval
          AND COALESCE(os.paga_em, os.fechada_em)::date >= CURRENT_DATE - (($1::int + 30) || ' days')::interval
          AND c.telefone IS NOT NULL
          AND (EXISTS (SELECT 1 FROM os_servicos s WHERE s.os_id = os.id AND s.servico_id = ANY($2::uuid[]))
            OR EXISTS (SELECT 1 FROM os_pecas p WHERE p.os_id = os.id AND p.peca_id = ANY($3::uuid[])))
          ${condCarro}
          AND NOT EXISTS (
            SELECT 1 FROM followup_fila ff WHERE ff.os_origem_id = os.id AND ff.regra_id = $4)
        LIMIT 300`,
      params,
    );
  },

  // Igual à Reativação, mas cada automação conta o próprio sumiço: dá para
  // ter 90 dias com um texto e 1 ano com outro.
  sumido: (regra) => {
    const params = [regra.intervalo_dias, regra.id];
    const condCarro = condicoesCarro(regra.filtros, params);
    return db.query(
      `WITH ultima AS (
         SELECT o.cliente_id, MAX(COALESCE(o.paga_em, o.fechada_em, o.aberta_em))::date AS ultima_visita
           FROM ordens_servico o
          WHERE o.status <> 'negada'
          GROUP BY o.cliente_id
       )
       SELECT c.id AS cliente_id, c.nome AS nome_cliente,
              ca.id AS carro_id, COALESCE(ca.marca,'') AS marca, COALESCE(ca.modelo,'') AS modelo,
              COALESCE(ca.placa,'') AS placa,
              NULL::uuid AS os_origem_id, ''::text AS servico,
              (CURRENT_DATE - u.ultima_visita)::int AS dias_desde
         FROM clientes c
         JOIN ultima u ON u.cliente_id = c.id
         ${carroDoCliente(condCarro)}
        WHERE c.ativo AND c.telefone IS NOT NULL
          AND u.ultima_visita <= CURRENT_DATE - ($1::int || ' days')::interval
          ${exigirCarro(condCarro)}
          AND NOT EXISTS (
            SELECT 1 FROM followup_fila ff
             WHERE ff.cliente_id = c.id AND ff.regra_id = $2
               AND ff.criado_em > u.ultima_visita
          )
        LIMIT 300`,
      params,
    );
  },

  // No dia do aniversário (29/02 cai em 28/02 nos anos comuns).
  aniversario: (regra) => {
    const params = [regra.id];
    const condCarro = condicoesCarro(regra.filtros, params);
    return db.query(
      `SELECT c.id AS cliente_id, c.nome AS nome_cliente,
              ca.id AS carro_id, COALESCE(ca.marca,'') AS marca, COALESCE(ca.modelo,'') AS modelo,
              COALESCE(ca.placa,'') AS placa,
              NULL::uuid AS os_origem_id, ''::text AS servico, 0 AS dias_desde
         FROM clientes c
         ${carroDoCliente(condCarro)}
        WHERE c.ativo AND c.telefone IS NOT NULL AND c.data_nascimento IS NOT NULL
          AND (c.data_nascimento + make_interval(years =>
                (extract(year FROM CURRENT_DATE) - extract(year FROM c.data_nascimento))::int))::date = CURRENT_DATE
          ${exigirCarro(condCarro)}
          AND NOT EXISTS (
            SELECT 1 FROM followup_fila ff
             WHERE ff.cliente_id = c.id AND ff.regra_id = $1
               AND ff.criado_em > now() - interval '300 days'
          )`,
      params,
    );
  },

  campanha: (regra) => {
    const { sql, params } = consultaCampanha(regra);
    return db.query(sql, params);
  },
};

const candidatosDa = (regra) => (
  regra.chave ? CANDIDATOS[regra.chave](regra) : CANDIDATOS_GATILHO[regra.gatilho](regra)
);

async function inserirDaRegra(regra, candidatos, template, userId) {
  const oficina = await nomeOficina();
  let gerados = 0;
  for (const cand of candidatos) {
    const mensagem = renderizar(template, {
      nome_cliente: cand.nome_cliente,
      modelo_carro: [cand.marca, cand.modelo].filter(Boolean).join(' ').trim() || 'carro',
      placa: cand.placa,
      servico: cand.servico,
      dias_desde: cand.dias_desde,
      oficina,
    });
    try {
      const ins = await db.query(
        `INSERT INTO followup_fila
           (cliente_id, carro_id, regra_id, os_origem_id, retorno_id, tipo, mensagem, criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [cand.cliente_id, cand.carro_id || null, regra.id, cand.os_origem_id || null,
          cand.retorno_id || null, regra.tipo, mensagem, userId || null],
      );
      await registrarHistorico(ins.rows[0].id, 'criado_automatico', userId);
      gerados += 1;
    } catch (e) {
      // Índices únicos (mesmo retorno / mesmo cliente+carro+regra pendente).
      if (!/duplicate|unique/i.test(e.message)) throw e;
    }
  }
  return gerados;
}

/**
 * Gera a fila pelas automações ativas (revisão, pós-serviço, reativação).
 * Campanha não entra aqui: só sai quando o dono monta (montarCampanha).
 * Idempotente: rodar de novo não duplica.
 */
async function gerarFila({ chave, id } = {}, userId) {
  await garantirAutomacoes();
  const params = [['revisao', 'pos_servico', 'reativacao'], ['servico_feito', 'sumido', 'aniversario']];
  let filtro = '';
  if (chave) { params.push(chave); filtro = `AND chave = $${params.length}`; }
  if (id) { params.push(id); filtro = `AND id = $${params.length}`; }
  const { rows: regras } = await db.query(
    `SELECT * FROM followup_regras
      WHERE ativo AND (chave = ANY($1) OR (chave IS NULL AND gatilho = ANY($2))) ${filtro}
      ORDER BY criado_em`, params,
  );
  const porAutomacao = {};
  let gerados = 0;
  for (const regra of regras) {
    const { rows } = await candidatosDa(regra);
    const n = await inserirDaRegra(regra, rows, regra.mensagem_template, userId);
    porAutomacao[regra.chave || regra.id] = n;
    gerados += n;
  }
  return { gerados, por_automacao: porAutomacao };
}

/**
 * Manda sozinho o que está pendente das automações com envio automático
 * ligado (até 100 por vez, com o intervalo do lote; o resto sai no dia
 * seguinte). Chamado pela geração das 8h. Retorna o estado do lote ou null.
 */
async function enviarAutomaticos() {
  const { rows } = await db.query(
    `SELECT id FROM followup_regras
      WHERE ativo AND envio_automatico AND COALESCE(gatilho, '') <> 'campanha'
        AND COALESCE(chave, '') <> 'campanha'`,
  );
  if (!rows.length) return null;
  if (!(await assinatura.recursoNaOficinaAtual('whatsapp'))) return null;
  return enviarPendentesAgora(null, { regra_ids: rows.map((r) => r.id) });
}

/**
 * Prévia ou criação de uma campanha. Sem `regra_id` é o cartão fixo
 * Campanha; com `regra_id`, uma campanha própria (público filtrado).
 * `mensagem` sobrescreve o texto só nesta vez. `confirmar=false` só conta
 * o público. Com envio automático ligado, já começa a enviar.
 */
async function montarCampanha({ mensagem, confirmar = false, regra_id } = {}, userId) {
  await garantirAutomacoes();
  const { rows } = regra_id
    ? await db.query(`SELECT * FROM followup_regras WHERE id = $1 AND gatilho = 'campanha'`, [regra_id])
    : await db.query(`SELECT * FROM followup_regras WHERE chave = 'campanha'`);
  const regra = rows[0];
  if (!regra) throw AppError.notFound('Campanha não encontrada');
  const texto = (mensagem ?? regra.mensagem_template ?? '').trim();
  if (confirmar && texto.length < 10) throw new AppError('Escreva a mensagem da campanha', 422);
  const { rows: publico } = await candidatosDa(regra);
  if (!confirmar) {
    return { publico: publico.length, exemplo: publico[0]?.nome_cliente || null };
  }
  const gerados = await inserirDaRegra(regra, publico, texto, userId);
  let envio = null;
  if (regra.envio_automatico && gerados) {
    try {
      envio = await enviarPendentesAgora(userId, { regra_id: regra.id });
    } catch (e) {
      envio = { erro: e.message };
    }
  }
  return { publico: publico.length, gerados, envio };
}

// ---------------------------------------------------------------- RESPOSTA DO CLIENTE

/**
 * Mensagem recebida de um cliente: o que estava 'enviado' para ele nos
 * últimos 30 dias passa para 'respondeu'. Chamado pelo webhook do WhatsApp
 * (já dentro do contexto da oficina). `telefones` traz as formas possíveis
 * do número (com e sem o 9).
 */
async function registrarRespostaDoCliente(telefones) {
  const digitos = [...new Set((telefones || []).map((t) => String(t).replace(/\D/g, '')).filter(Boolean))];
  if (!digitos.length) return 0;
  const { rows } = await db.query(
    `UPDATE followup_fila f
        SET status = 'respondeu', respondido_em = now()
       FROM clientes c
      WHERE c.id = f.cliente_id
        AND regexp_replace(c.telefone, '\\D', '', 'g') = ANY($1)
        AND f.status = 'enviado'
        AND f.enviado_em >= now() - interval '30 days'
      RETURNING f.id`, [digitos],
  );
  for (const r of rows) await registrarHistorico(r.id, 'resposta_detectada', null);
  return rows.length;
}

// ---------------------------------------------------------------- RESULTADOS

/**
 * O que o follow-up trouxe de volta, pelos itens ENVIADOS no período:
 * por automação/tipo e por mês. "Voltou" = cliente abriu OS dentro da
 * janela (status converteu, ligado à OS). Faturamento = o que essas OS
 * renderam (pagas).
 */
async function resultados({ meses = 6 } = {}) {
  const m = Math.min(Math.max(Number(meses) || 6, 1), 24);
  const base = `
    FROM followup_fila f
    LEFT JOIN ordens_servico o ON o.id = f.convertido_os_id
   WHERE f.enviado_em >= date_trunc('month', CURRENT_DATE) - (($1::int - 1) || ' months')::interval`;
  const cols = `
    count(*)::int AS enviados,
    count(*) FILTER (WHERE f.status IN ('respondeu','converteu') OR f.respondido_em IS NOT NULL)::int AS responderam,
    count(*) FILTER (WHERE f.status = 'converteu')::int AS voltaram,
    COALESCE(sum(COALESCE(o.valor_pago, o.valor_total)) FILTER (WHERE o.status = 'paga'), 0)::numeric AS faturamento`;
  const [tot, porTipo, porMes, porAutomacao] = await Promise.all([
    db.query(`SELECT ${cols} ${base}`, [m]),
    db.query(`SELECT f.tipo, ${cols} ${base} GROUP BY f.tipo`, [m]),
    db.query(
      `SELECT to_char(date_trunc('month', f.enviado_em), 'YYYY-MM') AS mes, ${cols} ${base}
        GROUP BY 1 ORDER BY 1`, [m],
    ),
    // Por automação. Sem regra = criado à mão ou de automação apagada.
    db.query(
      `SELECT f.regra_id, COALESCE(r.nome, 'Manual ou apagada') AS nome, r.chave, r.gatilho,
              ${cols}
         FROM followup_fila f
         LEFT JOIN ordens_servico o ON o.id = f.convertido_os_id
         LEFT JOIN followup_regras r ON r.id = f.regra_id
        WHERE f.enviado_em >= date_trunc('month', CURRENT_DATE) - (($1::int - 1) || ' months')::interval
        GROUP BY f.regra_id, r.nome, r.chave, r.gatilho
        ORDER BY count(*) DESC`, [m],
    ),
  ]);
  const num = (r) => ({
    enviados: r.enviados, responderam: r.responderam, voltaram: r.voltaram,
    faturamento: Number(r.faturamento),
  });
  return {
    meses: m,
    total: num(tot.rows[0]),
    por_tipo: Object.fromEntries(porTipo.rows.map((r) => [r.tipo, num(r)])),
    por_mes: porMes.rows.map((r) => ({ mes: r.mes, ...num(r) })),
    por_automacao: porAutomacao.rows.map((r) => ({
      regra_id: r.regra_id, nome: r.nome, chave: r.chave, gatilho: r.gatilho, ...num(r),
    })),
  };
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
  gerarFila, metricas, renderizar,
  listarAutomacoes, atualizarAutomacao, criarAutomacao, removerAutomacao, montarCampanha,
  enviarAutomaticos,
  registrarRespostaDoCliente, resultados,
  enviarAgora, enviarPendentesAgora, estadoLote, conferirEnvios,
  kanban, historicoDoCliente,
};
