'use strict';
const db = require('../config/db');
const AppError = require('../utils/AppError');
const provisionamento = require('./provisionamento.service');
const auth = require('./auth.service');

/**
 * Cadastro self-service pela landing: a própria oficina cria a conta e
 * entra em teste de 14 dias (mesmo provisionamento do super-admin).
 *
 * Proteções de uma rota pública que cria schema no banco:
 *   - limite por IP (CADASTRO_LIMITE_IP por hora, padrão 3);
 *   - limite geral por dia (CADASTRO_LIMITE_DIA, padrão 30);
 *   - campo-armadilha (honeypot) que só robô preenche;
 *   - e-mail único em toda a plataforma (o login por e-mail não fica ambíguo).
 * Os contadores ficam em memória: reiniciar a API zera, o que basta aqui.
 */

const LIMITE_IP = Number(process.env.CADASTRO_LIMITE_IP) || 3;
const LIMITE_DIA = Number(process.env.CADASTRO_LIMITE_DIA) || 30;
const HORA = 60 * 60 * 1000;

const porIp = new Map(); // ip -> [timestamps]
let dia = { data: '', total: 0 };

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function checarLimites(ip, agora = Date.now()) {
  if (dia.data !== hoje()) dia = { data: hoje(), total: 0 };
  if (dia.total >= LIMITE_DIA) {
    throw new AppError('Muitos cadastros hoje. Fale com a gente pelo WhatsApp que liberamos seu acesso.', 429);
  }
  const recentes = (porIp.get(ip) || []).filter((t) => agora - t < HORA);
  if (recentes.length >= LIMITE_IP) {
    throw new AppError('Muitas tentativas. Tente de novo daqui a pouco ou fale com a gente pelo WhatsApp.', 429);
  }
  porIp.set(ip, recentes);
}

function contar(ip, agora = Date.now()) {
  porIp.get(ip).push(agora);
  dia.total += 1;
}

/** "Auto Elétrica São João" -> "auto_eletrica_sao_joao" (regra do SLUG_RE). */
function slugBase(nome) {
  let s = String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/^[a-z]/.test(s)) s = `oficina_${s}`;
  s = s.slice(0, 26).replace(/_+$/, '');
  return s.length >= 3 ? s : 'oficina';
}

async function slugLivre(nome) {
  const base = slugBase(nome);
  const { rows } = await db.pool.query(
    'SELECT slug FROM oficinas WHERE slug = $1 OR slug LIKE $2', [base, `${base}\\_%`],
  );
  const usados = new Set(rows.map((r) => r.slug));
  if (!usados.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const s = `${base}_${i}`;
    if (!usados.has(s)) return s;
  }
  throw new AppError('Não foi possível gerar o endereço da oficina', 500);
}

async function cadastrar(dados, ip) {
  checarLimites(ip);

  const email = dados.email.trim().toLowerCase();
  const { rows } = await db.pool.query(
    'SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1', [email],
  );
  if (rows[0]) {
    throw new AppError('Este e-mail já tem cadastro. Entre no sistema ou use outro e-mail.', 409);
  }

  const slug = await slugLivre(dados.oficina);
  const of = await provisionamento.criarOficina({
    slug,
    nome: dados.oficina.trim(),
    admin: { nome: dados.nome.trim(), email, senha: dados.senha },
  });
  contar(ip);

  await db.pool.query(
    'UPDATE oficinas SET telefone = $1, cidade = $2 WHERE id = $3',
    [dados.telefone.trim(), dados.cidade?.trim() || null, of.id],
  );
  console.log(`[cadastro] nova oficina em teste: ${of.nome} (${of.slug})`);

  return auth.login(email, dados.senha, of.slug);
}

/** Só pros testes: zera os contadores em memória. */
function _zerarLimites() {
  porIp.clear();
  dia = { data: '', total: 0 };
}

module.exports = { cadastrar, slugBase, checarLimites, contar, _zerarLimites };
