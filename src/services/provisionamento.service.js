'use strict';
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const planos = require('../config/planos');
const assinatura = require('./assinatura.service');

/**
 * Provisionamento de oficinas novas (onboarding por admin da plataforma).
 *
 * Fluxo atômico (uma transação — DDL no Postgres é transacional):
 *   1) valida slug/nome/admin
 *   2) insere a linha em public.oficinas
 *   3) clona a ESTRUTURA de oficina_maninho -> oficina_<slug> (clone_schema)
 *   4) semeia defaults NEUTROS (etapas do Kanban + categorias de despesa)
 *   5) cria o usuário admin da oficina em public.users
 * Qualquer falha dá ROLLBACK e desfaz tudo (inclusive o schema criado).
 *
 * Não copia dados da Maninho (catálogo, clientes, templates de follow-up
 * com a marca dela) — a oficina nova começa limpa.
 */

const SLUG_RE = /^[a-z][a-z0-9_]{2,30}$/;

// Mesmas 4 etapas default da migration 029 (genéricas, servem a qualquer oficina).
const ETAPAS_DEFAULT = [
  ['Aberta', '#94a3b8', 1, 'aberta'],
  ['Em andamento', '#D4A843', 2, 'em_andamento'],
  ['Finalizada', '#283090', 3, 'finalizada'],
  ['Paga', '#10b981', 4, 'paga'],
];

// Mesmas categorias default da migration 002 (nomes genéricos).
const CATEGORIAS_DEFAULT = [
  ['Peças e materiais', '#2B3D8F', 10],
  ['Aluguel', '#7c3aed', 20],
  ['Salários', '#0891b2', 30],
  ['Energia e água', '#ea580c', 40],
  ['Ferramentas', '#D4A843', 50],
  ['Impostos e taxas', '#dc2626', 60],
  ['Combustível', '#65a30d', 70],
  ['Marketing', '#db2777', 80],
  ['Manutenção', '#0d9488', 90],
  ['Outros', '#64748b', 999],
];

async function criarOficina({ slug, nome, admin }) {
  slug = String(slug || '').trim().toLowerCase();
  nome = String(nome || '').trim();

  if (!SLUG_RE.test(slug)) {
    throw new AppError(
      'Slug inválido. Use 3-31 caracteres: letras minúsculas, dígitos e _ (começando por letra).',
      422,
    );
  }
  if (!nome) throw new AppError('Nome da oficina é obrigatório', 422);
  if (!admin || !admin.nome || !admin.email || !admin.senha) {
    throw new AppError('Dados do admin (nome, email, senha) são obrigatórios', 422);
  }
  if (String(admin.senha).length < 8) {
    throw new AppError('Senha do admin deve ter ao menos 8 caracteres', 422);
  }

  const schema = db.schemaSeguro(slug); // oficina_<slug>, sanitizado
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Checa unicidade do slug (a UNIQUE constraint também protege, mas assim
    // devolvemos erro amigável antes de clonar).
    const existe = await client.query('SELECT 1 FROM oficinas WHERE slug = $1', [slug]);
    if (existe.rows[0]) throw new AppError(`Já existe oficina com slug "${slug}"`, 409);

    // Nasce em trial de 14 dias (Fase A da assinatura).
    const of = await client.query(
      `INSERT INTO oficinas (slug, nome, assinatura_status, trial_fim)
       VALUES ($1, $2, 'trial', CURRENT_DATE + 14) RETURNING id`, [slug, nome],
    );
    const oficinaId = of.rows[0].id;

    // Clona a estrutura (search_path=public é setado DENTRO da função).
    await client.query('SELECT public.clone_schema($1, $2)', ['oficina_maninho', schema]);

    // Seed neutro no schema novo.
    await client.query(`SET LOCAL search_path = ${schema}, public`);
    for (const [n, cor, ordem, status] of ETAPAS_DEFAULT) {
      await client.query(
        'INSERT INTO etapas_kanban (nome, cor, ordem, status_ao_entrar) VALUES ($1,$2,$3,$4)',
        [n, cor, ordem, status],
      );
    }
    for (const [n, cor, ordem] of CATEGORIAS_DEFAULT) {
      await client.query(
        'INSERT INTO categorias_despesa (nome, cor, ordem) VALUES ($1,$2,$3)',
        [n, cor, ordem],
      );
    }
    await client.query('SET LOCAL search_path = public');

    // Usuário admin da oficina.
    const hash = await bcrypt.hash(String(admin.senha), 10);
    await client.query(
      `INSERT INTO users (nome, email, senha_hash, role, oficina_id)
       VALUES ($1, $2, $3, 'admin', $4)`,
      [String(admin.nome).trim(), String(admin.email).trim().toLowerCase(), hash, oficinaId],
    );

    await client.query('COMMIT');
    return { id: oficinaId, slug, nome };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Email duplicado na mesma oficina (constraint composta) ou slug corrida.
    if (/duplicate|unique/i.test(err.message) && !(err instanceof AppError)) {
      throw new AppError('Conflito ao criar (slug ou email já em uso)', 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Oficinas com o que o dono da plataforma precisa ver de cada uma:
 * plano e valor cobrado, situação da assinatura, usuários e acessos.
 */
async function listarOficinas() {
  const { rows } = await db.pool.query(
    `SELECT o.id, o.slug, o.nome, o.ativo, o.criado_em,
            o.assinatura_status, o.plano, o.ciclo,
            o.trial_fim::text          AS trial_fim,
            o.proximo_vencimento::text AS proximo_vencimento,
            o.graca_dias,
            CURRENT_DATE::text         AS hoje,
            (SELECT count(*) FROM users u WHERE u.oficina_id = o.id)::int AS usuarios,
            (SELECT count(*) FROM users u WHERE u.oficina_id = o.id AND u.ativo)::int AS usuarios_ativos,
            (SELECT count(*) FROM acessos_login a
              WHERE a.oficina_id = o.id AND a.criado_em > now() - interval '30 days')::int AS acessos_30d,
            (SELECT count(*) FROM acessos_login a WHERE a.oficina_id = o.id)::int AS acessos_total,
            (SELECT max(u.ultimo_acesso_em) FROM users u WHERE u.oficina_id = o.id) AS ultimo_acesso
       FROM oficinas o
      ORDER BY o.criado_em DESC`,
  );
  return rows.map((o) => {
    const p = planos.doPlano(o.plano);
    const { hoje, ...resto } = o;
    return {
      ...resto,
      valor: o.ciclo === 'anual' ? p.anual : p.mensal,
      // Quanto a oficina vale por mês, pra somar a receita recorrente.
      valor_mensal: o.ciclo === 'anual' ? Math.round((p.anual / 12) * 100) / 100 : p.mensal,
      avaliacao: assinatura.avaliar(o),
    };
  });
}

/** Números gerais da plataforma pro topo do painel do super-admin. */
async function resumoPlataforma() {
  const oficinas = await listarOficinas();
  const por = (st) => oficinas.filter((o) => o.assinatura_status === st);
  const ativas = por('ativa');
  const trial = por('trial');

  const { rows: [acessos] } = await db.pool.query(
    `SELECT count(*) FILTER (WHERE criado_em::date = CURRENT_DATE)::int        AS hoje,
            count(*) FILTER (WHERE criado_em > now() - interval '30 days')::int AS ultimos_30d
       FROM acessos_login`,
  );
  const { rows: visitasDia } = await db.pool.query(
    `SELECT d::date::text AS dia, coalesce(sum(v.total), 0)::int AS total
       FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, interval '1 day') d
       LEFT JOIN visitas_site v ON v.dia = d::date
      GROUP BY d ORDER BY d`,
  );

  return {
    oficinas: {
      total: oficinas.length,
      ativas: ativas.length,
      trial: trial.length,
      // Em teste com o fim chegando nos próximos 7 dias: hora de ligar.
      trial_vencendo: trial.filter((o) => o.avaliacao.dias_restantes != null
        && !o.avaliacao.em_graca && o.avaliacao.dias_restantes <= 7).length,
      inadimplentes: por('inadimplente').length,
      canceladas: por('cancelada').length,
    },
    receita: {
      // Receita recorrente mensal: só quem está pagando (ativa).
      mensal: Math.round(ativas.reduce((s, o) => s + o.valor_mensal, 0) * 100) / 100,
      // Se todas em teste virassem clientes no plano atual.
      potencial_trial: Math.round(trial.reduce((s, o) => s + o.valor_mensal, 0) * 100) / 100,
      em_atraso: Math.round(por('inadimplente').reduce((s, o) => s + o.valor, 0) * 100) / 100,
    },
    acessos,
    visitas_site: {
      hoje: visitasDia[visitasDia.length - 1]?.total || 0,
      ultimos_30d: visitasDia.reduce((s, d) => s + d.total, 0),
      por_dia: visitasDia,
    },
  };
}

module.exports = { criarOficina, listarOficinas, resumoPlataforma };
