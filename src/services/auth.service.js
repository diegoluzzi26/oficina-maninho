'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const planos = require('../config/planos');

/**
 * Login multi-oficina. O usuário informa email + senha e (opcionalmente)
 * a oficina. Se omitir a oficina:
 *   - se o email só existe em UMA oficina, entra sem atrito;
 *   - se existe em várias, retorna erro pedindo pra escolher.
 */
async function login(email, senha, oficinaSlug) {
  const generico = AppError.unauthorized('E-mail ou senha inválidos');

  const params = [email];
  let where = 'lower(u.email) = lower($1) AND u.ativo';
  if (oficinaSlug) {
    params.push(oficinaSlug);
    where += ` AND o.slug = $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT u.*, o.slug AS oficina_slug, o.nome AS oficina_nome
       FROM users u
       JOIN oficinas o ON o.id = u.oficina_id
      WHERE ${where}
      LIMIT 2`,
    params,
  );

  if (rows.length === 0) throw generico;
  if (rows.length > 1) {
    // Email em mais de uma oficina e não veio slug — força escolha
    throw new AppError('Escolha a oficina antes de entrar', 422);
  }

  const user = rows[0];
  const ok = await bcrypt.compare(senha, user.senha_hash);
  if (!ok) throw generico;

  const token = jwt.sign(
    {
      sub: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      oficina_id: user.oficina_id,
      oficina_slug: user.oficina_slug,
      super_admin: user.super_admin === true,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
  return {
    token,
    usuario: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      oficina_id: user.oficina_id,
      oficina_slug: user.oficina_slug,
      oficina_nome: user.oficina_nome,
      super_admin: user.super_admin === true,
    },
  };
}

/**
 * Cria usuário SEMPRE dentro da oficina do criador. `oficina_id` do body é
 * ignorado de propósito — um admin não pode criar usuário em outra oficina.
 */
/**
 * Barra criar/reativar usuário além do limite do plano da oficina.
 * `ignorarId` exclui da contagem o próprio usuário sendo reativado.
 */
async function checarLimiteUsuarios(oficinaId, ignorarId = null) {
  const { rows } = await db.pool.query(
    `SELECT o.plano,
            (SELECT count(*)::int FROM users u
              WHERE u.oficina_id = o.id AND u.ativo
                AND u.id IS DISTINCT FROM $2) AS ativos
       FROM oficinas o WHERE o.id = $1`, [oficinaId, ignorarId],
  );
  if (!rows[0]) return;
  const plano = planos.doPlano(rows[0].plano);
  if (plano.usuarios !== null && rows[0].ativos >= plano.usuarios) {
    throw new AppError(
      `O plano ${plano.nome} permite até ${plano.usuarios} usuários ativos`, 403,
      { limite: plano.usuarios },
    );
  }
}

async function criarUsuario({ nome, email, senha, role }, oficinaId) {
  if (!oficinaId) throw new AppError('Oficina do criador ausente', 400);
  await checarLimiteUsuarios(oficinaId);
  const hash = await bcrypt.hash(senha, 10);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (nome, email, senha_hash, role, oficina_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, nome, email, role, ativo, oficina_id, criado_em`,
      [nome, email.toLowerCase(), hash, role || 'atendente', oficinaId],
    );
    return rows[0];
  } catch (err) {
    if (/duplicate|unique/i.test(err.message)) {
      throw new AppError('Já existe usuário com esse e-mail nesta oficina', 409);
    }
    throw err;
  }
}

/**
 * Atualiza um usuário DA MESMA oficina (oficina_id no WHERE impede mexer em
 * usuário de outra oficina). Só os campos enviados mudam. Senha opcional.
 */
async function atualizarUsuario(id, { nome, role, ativo, senha }, oficinaId) {
  const sets = []; const params = [];
  if (nome !== undefined)  { params.push(nome);  sets.push(`nome = $${params.length}`); }
  if (role !== undefined)  { params.push(role);  sets.push(`role = $${params.length}`); }
  if (ativo !== undefined) { params.push(ativo); sets.push(`ativo = $${params.length}`); }
  if (senha) { params.push(await bcrypt.hash(senha, 10)); sets.push(`senha_hash = $${params.length}`); }
  if (!sets.length) throw new AppError('Nada para atualizar', 422);
  if (ativo === true) await checarLimiteUsuarios(oficinaId, id);

  params.push(id, oficinaId);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND oficina_id = $${params.length}
      RETURNING id, nome, email, role, ativo, oficina_id, criado_em`,
    params,
  );
  if (!rows[0]) throw AppError.notFound('Usuário não encontrado');
  return rows[0];
}

// Campos públicos da identidade visual. `logo_versao` muda a cada upload
// e entra na URL da logo pra furar o cache do navegador.
const COLUNAS_IDENTIDADE = `id, slug, nome, cor_primaria, cor_secundaria,
  CASE WHEN logo IS NULL THEN NULL
       ELSE (extract(epoch FROM logo_atualizada_em) * 1000)::bigint::text END AS logo_versao`;

// Identidade + dados de contato da impressão. Só pra usuário logado — a
// lista pública do login (oficinas.routes) segue com o mínimo.
const COLUNAS_OFICINA = `${COLUNAS_IDENTIDADE},
  endereco, cidade, uf, telefone, especialidades`;

/** Identidade visual e dados da impressão da própria oficina. */
async function identidadeOficina(oficinaId) {
  const { rows } = await db.pool.query(
    `SELECT ${COLUNAS_OFICINA} FROM oficinas WHERE id = $1`, [oficinaId],
  );
  if (!rows[0]) throw AppError.notFound('Oficina não encontrada');
  return rows[0];
}

// Dados de contato da impressão: texto livre; vazio grava NULL (linha some).
const CAMPOS_IMPRESSAO = ['endereco', 'cidade', 'uf', 'telefone', 'especialidades'];

/**
 * Edita dados da PRÓPRIA oficina: nome, cores e dados da impressão (o slug
 * é o schema e não muda). Só os campos enviados mudam; cor `null` volta pro
 * padrão. Escopado pelo oficina_id do admin logado.
 */
async function atualizarMinhaOficina(oficinaId, dados) {
  const { nome, cor_primaria, cor_secundaria } = dados;
  const sets = []; const params = [];
  if (nome !== undefined) {
    const n = String(nome || '').trim();
    if (!n) throw new AppError('Nome da oficina é obrigatório', 422);
    params.push(n); sets.push(`nome = $${params.length}`);
  }
  if (cor_primaria !== undefined) {
    params.push(cor_primaria && cor_primaria.toLowerCase());
    sets.push(`cor_primaria = $${params.length}`);
  }
  if (cor_secundaria !== undefined) {
    params.push(cor_secundaria && cor_secundaria.toLowerCase());
    sets.push(`cor_secundaria = $${params.length}`);
  }
  for (const campo of CAMPOS_IMPRESSAO) {
    if (dados[campo] === undefined) continue;
    let v = String(dados[campo] || '').trim() || null;
    if (v && campo === 'uf') v = v.toUpperCase();
    params.push(v); sets.push(`${campo} = $${params.length}`);
  }
  if (!sets.length) throw new AppError('Nada para atualizar', 422);

  params.push(oficinaId);
  const { rows } = await db.pool.query(
    `UPDATE oficinas SET ${sets.join(', ')} WHERE id = $${params.length}
      RETURNING ${COLUNAS_OFICINA}`,
    params,
  );
  if (!rows[0]) throw AppError.notFound('Oficina não encontrada');
  return rows[0];
}

/** Grava (ou troca) a logo da própria oficina. Arquivo já validado no upload. */
async function salvarLogoOficina(oficinaId, { buffer, mimetype }) {
  const { rows } = await db.pool.query(
    `UPDATE oficinas SET logo = $1, logo_mime = $2, logo_atualizada_em = now()
      WHERE id = $3 RETURNING ${COLUNAS_OFICINA}`,
    [buffer, mimetype, oficinaId],
  );
  if (!rows[0]) throw AppError.notFound('Oficina não encontrada');
  return rows[0];
}

async function removerLogoOficina(oficinaId) {
  const { rows } = await db.pool.query(
    `UPDATE oficinas SET logo = NULL, logo_mime = NULL, logo_atualizada_em = NULL
      WHERE id = $1 RETURNING ${COLUNAS_OFICINA}`,
    [oficinaId],
  );
  if (!rows[0]) throw AppError.notFound('Oficina não encontrada');
  return rows[0];
}

async function listarUsuarios(oficinaId) {
  const params = [];
  let where = '';
  if (oficinaId) {
    params.push(oficinaId);
    where = 'WHERE oficina_id = $1';
  }
  const { rows } = await db.query(
    `SELECT id, nome, email, role, ativo, oficina_id, criado_em
       FROM users ${where} ORDER BY criado_em`,
    params,
  );
  return rows;
}

module.exports = {
  login, criarUsuario, atualizarUsuario, listarUsuarios, atualizarMinhaOficina,
  identidadeOficina, salvarLogoOficina, removerLogoOficina, COLUNAS_IDENTIDADE,
};
