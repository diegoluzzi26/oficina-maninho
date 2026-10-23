'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');
const planos = require('../config/planos');

/**
 * Assinatura por oficina (Fase A — sem provedor de pagamento).
 *
 * `avaliar(o)` deriva o estado de acesso a partir dos campos de assinatura
 * da oficina (status + datas + graça). Datas são tratadas como strings
 * ISO (YYYY-MM-DD) pra evitar armadilhas de fuso — comparação lexicográfica
 * funciona e os diffs usam Date.UTC.
 *
 * Regra de bloqueio:
 *   ativa        -> liberado
 *   cancelada    -> bloqueado
 *   trial        -> liberado até trial_fim; +graca_dias em período de graça;
 *                   depois, bloqueado
 *   inadimplente -> liberado até proximo_vencimento + graca_dias (graça);
 *                   depois, bloqueado (sem data de vencimento, bloqueia já)
 */

const TRIAL_DIAS_PADRAO = 14;

function addDias(dataStr, n) {
  const d = new Date(Date.parse(`${dataStr}T00:00:00Z`));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDias(aStr, bStr) {
  return Math.round(
    (Date.parse(`${aStr}T00:00:00Z`) - Date.parse(`${bStr}T00:00:00Z`)) / 86400000,
  );
}

function avaliar(o) {
  const hoje = o.hoje;
  const graca = o.graca_dias ?? 5;

  if (o.ativo === false) {
    return { status: o.assinatura_status, bloqueada: true, motivo: 'Oficina desativada' };
  }

  switch (o.assinatura_status) {
    case 'ativa':
      return { status: 'ativa', bloqueada: false };

    case 'cancelada':
      return { status: 'cancelada', bloqueada: true, motivo: 'Assinatura cancelada' };

    case 'trial': {
      if (!o.trial_fim) return { status: 'trial', bloqueada: false };
      const limite = addDias(o.trial_fim, graca);
      if (hoje <= o.trial_fim) {
        return { status: 'trial', bloqueada: false, dias_restantes: diffDias(o.trial_fim, hoje) };
      }
      if (hoje <= limite) {
        return {
          status: 'trial', bloqueada: false, em_graca: true,
          dias_restantes: diffDias(limite, hoje),
          motivo: 'Período de teste encerrado — regularize pra continuar',
        };
      }
      return { status: 'trial', bloqueada: true, motivo: 'Período de teste encerrado' };
    }

    case 'inadimplente': {
      if (!o.proximo_vencimento) {
        return { status: 'inadimplente', bloqueada: true, motivo: 'Pagamento pendente' };
      }
      const limite = addDias(o.proximo_vencimento, graca);
      if (hoje <= limite) {
        return {
          status: 'inadimplente', bloqueada: false, em_graca: true,
          dias_restantes: diffDias(limite, hoje),
          motivo: 'Pagamento pendente',
        };
      }
      return { status: 'inadimplente', bloqueada: true, motivo: 'Pagamento em atraso' };
    }

    default:
      return { status: o.assinatura_status, bloqueada: false };
  }
}

// Campos de assinatura + datas como texto + CURRENT_DATE, de uma oficina.
const SELECT_ASSINATURA = `
  SELECT o.id, o.slug, o.nome, o.ativo, o.assinatura_status, o.plano,
         o.trial_fim::text          AS trial_fim,
         o.proximo_vencimento::text AS proximo_vencimento,
         o.graca_dias,
         CURRENT_DATE::text         AS hoje
    FROM oficinas o`;

async function daOficina(oficinaId) {
  const { rows } = await db.pool.query(`${SELECT_ASSINATURA} WHERE o.id = $1`, [oficinaId]);
  const o = rows[0];
  if (!o) return null;
  return { ...o, avaliacao: avaliar(o) };
}

/** Avalia pelo usuário logado, já detectando super-admin (nunca bloqueado). */
async function avaliarParaUsuario(userId) {
  const { rows } = await db.pool.query(
    `SELECT u.super_admin,
            o.id, o.slug, o.nome, o.ativo, o.assinatura_status, o.plano,
            o.trial_fim::text          AS trial_fim,
            o.proximo_vencimento::text AS proximo_vencimento,
            o.graca_dias,
            CURRENT_DATE::text         AS hoje
       FROM users u
       JOIN oficinas o ON o.id = u.oficina_id
      WHERE u.id = $1`, [userId],
  );
  const o = rows[0];
  if (!o) return null;
  return {
    super_admin: o.super_admin === true,
    oficina: {
      id: o.id, slug: o.slug, nome: o.nome,
      status: o.assinatura_status, plano: o.plano,
      trial_fim: o.trial_fim, proximo_vencimento: o.proximo_vencimento,
    },
    avaliacao: avaliar(o),
  };
}

/**
 * O plano da oficina do contexto atual (runComOficina) inclui o recurso?
 * Usado por jobs e serviços que rodam sem req.user. Fora de contexto
 * (scripts CLI) não restringe.
 */
async function recursoNaOficinaAtual(recurso) {
  const slug = db.slugAtual();
  if (!slug) return true;
  const { rows } = await db.pool.query('SELECT plano FROM oficinas WHERE slug = $1', [slug]);
  return planos.temRecurso(rows[0]?.plano, recurso);
}

async function atualizar(oficinaId, campos) {
  const permit = ['assinatura_status', 'plano', 'ciclo', 'trial_fim', 'proximo_vencimento', 'graca_dias'];
  const sets = []; const params = [];
  for (const [k, v] of Object.entries(campos)) {
    if (!permit.includes(k) || v === undefined) continue;
    params.push(v === '' ? null : v);
    sets.push(`${k} = $${params.length}`);
  }
  if (!sets.length) return daOficina(oficinaId);
  params.push(oficinaId);
  const { rows } = await db.pool.query(
    `UPDATE oficinas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`, params,
  );
  if (!rows[0]) throw AppError.notFound('Oficina não encontrada');
  return daOficina(oficinaId);
}

module.exports = {
  TRIAL_DIAS_PADRAO, avaliar, daOficina, avaliarParaUsuario, atualizar,
  recursoNaOficinaAtual,
};
