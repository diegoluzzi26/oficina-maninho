'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Contrato / Termos de uso, aceite por oficina (o admin aceita pela empresa).
 * Textos ficam em public.contratos (editados pelo super-admin); aceites em
 * public.contrato_aceites. Maninho (plataforma) e super-admin são isentos.
 */

async function versaoAtual() {
  const { rows } = await db.pool.query(
    'SELECT versao, titulo, texto, criado_em FROM contratos ORDER BY versao DESC LIMIT 1',
  );
  return rows[0] || null;
}

/**
 * Status do contrato pro usuário logado: se a oficina dele precisa aceitar
 * a versão vigente, se ele (admin) pode aceitar, e qual o texto atual.
 */
async function statusParaUsuario(userId) {
  const { rows } = await db.pool.query(
    `SELECT u.super_admin, u.role, o.id AS oficina_id, o.slug,
            (SELECT max(versao) FROM contratos) AS versao_atual,
            (SELECT max(ca.versao) FROM contrato_aceites ca
              WHERE ca.oficina_id = o.id) AS versao_aceita
       FROM users u
       JOIN oficinas o ON o.id = u.oficina_id
      WHERE u.id = $1`, [userId],
  );
  const r = rows[0];
  if (!r) return null;

  const isento = r.super_admin === true || r.slug === 'maninho';
  const pendente = !isento
    && r.versao_atual != null
    && (r.versao_aceita == null || r.versao_aceita < r.versao_atual);

  return {
    pendente,
    isento,
    versao_atual: r.versao_atual,
    versao_aceita: r.versao_aceita,
    pode_aceitar: r.role === 'admin', // só admin aceita pela oficina
    oficina_id: r.oficina_id,
  };
}

/** Registra o aceite da versão vigente pela oficina (idempotente). */
async function aceitar(oficinaId, userId, ip) {
  const atual = await versaoAtual();
  if (!atual) throw new AppError('Nenhum contrato publicado', 400);
  await db.pool.query(
    `INSERT INTO contrato_aceites (oficina_id, versao, usuario_id, ip)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (oficina_id, versao) DO NOTHING`,
    [oficinaId, atual.versao, userId, ip || null],
  );
  return { versao: atual.versao };
}

// ---- Super-admin ----

async function listarVersoes() {
  const { rows } = await db.pool.query(
    'SELECT versao, titulo, criado_em FROM contratos ORDER BY versao DESC',
  );
  return rows;
}

/** Publica uma versão nova (incrementa o número) — obriga re-aceite geral. */
async function publicarVersao({ titulo, texto }) {
  const t = String(titulo || '').trim();
  const c = String(texto || '').trim();
  if (!t || !c) throw new AppError('Título e texto são obrigatórios', 422);
  const { rows } = await db.pool.query(
    `INSERT INTO contratos (versao, titulo, texto)
     VALUES ((SELECT COALESCE(max(versao), 0) + 1 FROM contratos), $1, $2)
     RETURNING versao, titulo, texto, criado_em`,
    [t, c],
  );
  return rows[0];
}

module.exports = {
  versaoAtual, statusParaUsuario, aceitar, listarVersoes, publicarVersao,
};
