'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');

async function login(email, senha) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1', [email],
  );
  const user = rows[0];

  // Mensagem idêntica para e-mail inexistente e senha errada: não revelamos
  // quais e-mails estão cadastrados.
  const generico = AppError.unauthorized('E-mail ou senha inválidos');
  if (!user || !user.ativo) throw generico;

  const ok = await bcrypt.compare(senha, user.senha_hash);
  if (!ok) throw generico;

  const token = jwt.sign(
    { sub: user.id, nome: user.nome, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
  return {
    token,
    usuario: { id: user.id, nome: user.nome, email: user.email, role: user.role },
  };
}

async function criarUsuario({ nome, email, senha, role }) {
  const hash = await bcrypt.hash(senha, 10);
  const { rows } = await db.query(
    `INSERT INTO users (nome, email, senha_hash, role) VALUES ($1,$2,$3,$4)
     RETURNING id, nome, email, role, criado_em`,
    [nome, email.toLowerCase(), hash, role],
  );
  return rows[0];
}

async function listarUsuarios() {
  const { rows } = await db.query(
    'SELECT id, nome, email, role, ativo, criado_em FROM users ORDER BY criado_em',
  );
  return rows;
}

module.exports = { login, criarUsuario, listarUsuarios };
