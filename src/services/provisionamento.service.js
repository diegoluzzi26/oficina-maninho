'use strict';
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const AppError = require('../utils/AppError');

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

async function listarOficinas() {
  const { rows } = await db.pool.query(
    `SELECT o.id, o.slug, o.nome, o.ativo, o.criado_em,
            o.assinatura_status, o.plano,
            o.trial_fim::text          AS trial_fim,
            o.proximo_vencimento::text AS proximo_vencimento,
            o.graca_dias,
            (SELECT count(*) FROM users u WHERE u.oficina_id = o.id)::int AS usuarios
       FROM oficinas o
      ORDER BY o.criado_em DESC`,
  );
  return rows;
}

module.exports = { criarOficina, listarOficinas };
