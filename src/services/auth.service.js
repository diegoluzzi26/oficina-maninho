'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');

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
    },
  };
}

async function criarUsuario({ nome, email, senha, role, oficina_id }, criadorOficinaId) {
  const hash = await bcrypt.hash(senha, 10);
  // Se o admin não passou oficina_id, cria dentro da própria oficina
  const oficina = oficina_id || criadorOficinaId;
  const { rows } = await db.query(
    `INSERT INTO users (nome, email, senha_hash, role, oficina_id)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, nome, email, role, oficina_id, criado_em`,
    [nome, email.toLowerCase(), hash, role, oficina],
  );
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

module.exports = { login, criarUsuario, listarUsuarios };
