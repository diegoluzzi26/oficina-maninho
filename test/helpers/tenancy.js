'use strict';
/**
 * Harness de isolamento multi-oficina.
 *
 * O sistema isola oficinas por SCHEMA (oficina_<slug>), com `search_path`
 * setado por request (ver src/config/db.js). Para provar que uma oficina não
 * enxerga dados de outra, este harness:
 *
 *   1. Clona o schema-modelo `oficina_maninho` em dois schemas descartáveis
 *      (oficina_ta e oficina_tb) — estrutura idêntica, sem tocar em dados reais.
 *   2. Cria uma oficina + um admin para cada (em public.oficinas / public.users).
 *   3. Semeia um registro de cada tipo (cliente, carro, OS, despesa, fornecedor,
 *      anexo, mensagem de WhatsApp) dentro de cada schema.
 *   4. Sobe o app numa porta efêmera e devolve tokens + ids das duas oficinas.
 *
 * GUARDA: recusa rodar contra um banco cujo nome não contenha "test", e recusa
 * NODE_ENV=production. Os testes CRIAM e DROPAM schemas — o fluxo esperado é
 * apontar TEST_DATABASE_URL para um banco de teste (ex.: um dump de produção
 * restaurado localmente), nunca dev/prod. Ver test/README.md.
 */
require('dotenv').config();
process.env.NODE_ENV = 'test';

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

/** Checkpoints de diagnóstico (HARNESS_DEBUG=1 para ligar). */
const dbg = (m) => { if (process.env.HARNESS_DEBUG) process.stderr.write(`[harness] ${m}\n`); };

/** Aspas em identificador vindo do catálogo (defense in depth). */
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

function assertBancoDeTeste(url) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Recusado: NODE_ENV=production. Os testes de isolamento criam e dropam schemas.');
  }
  if (!url) {
    throw new Error('Defina TEST_DATABASE_URL (ou DATABASE_URL) apontando para um banco de TESTE.');
  }
  const nome = new URL(url).pathname.slice(1);
  if (!/test/i.test(nome)) {
    throw new Error(
      `Recusado: o banco "${nome}" não parece de teste. Aponte TEST_DATABASE_URL para um banco `
      + 'com "test" no nome (ex.: oficina_test). Esta suíte CRIA e DROPA schemas — '
      + 'nunca rode contra dev/produção. Veja test/README.md.',
    );
  }
}

/**
 * Clona a estrutura de `origem` em `destino`: tabelas (via LIKE INCLUDING ALL),
 * depois FKs, triggers e views — que LIKE não copia. Functions/types ficam no
 * public e são compartilhados, então continuam resolvendo por search_path.
 */
async function clonarSchema(mgmt, origem, destino) {
  await mgmt.query(`DROP SCHEMA IF EXISTS ${destino} CASCADE`);
  await mgmt.query(`CREATE SCHEMA ${destino}`);

  const tabelas = (await mgmt.query(
    'SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', [origem],
  )).rows.map((r) => r.tablename);

  // 1) Tabelas: LIKE copia colunas, defaults, colunas geradas, checks, PKs e índices.
  for (const t of tabelas) {
    await mgmt.query(`CREATE TABLE ${destino}.${ident(t)} (LIKE ${origem}.${ident(t)} INCLUDING ALL)`);
  }

  // 2) FKs. pg_get_constraintdef qualifica a tabela referenciada com o schema
  //    origem (fora do search_path). Reescreve origem→destino para as refs
  //    internas da oficina; refs a users/oficinas ficam sem schema no def e
  //    resolvem no public (que está no search_path default).
  const fks = (await mgmt.query(
    `SELECT c.conname, rel.relname AS tabela, pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class rel ON rel.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = $1 AND c.contype = 'f'`, [origem],
  )).rows;
  for (const fk of fks) {
    const def = fk.def.replaceAll(`${origem}.`, `${destino}.`);
    await mgmt.query(
      `ALTER TABLE ${destino}.${ident(fk.tabela)} ADD CONSTRAINT ${ident(fk.conname)} ${def}`,
    );
  }

  // 3) Triggers. pg_get_triggerdef qualifica a tabela com o schema origem; troca
  //    para o destino. A FUNCTION referenciada vive no public e não é tocada.
  const trgs = (await mgmt.query(
    `SELECT pg_get_triggerdef(tg.oid) AS def
       FROM pg_trigger tg
       JOIN pg_class rel ON rel.oid = tg.tgrelid
       JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = $1 AND NOT tg.tgisinternal`, [origem],
  )).rows;
  for (const tr of trgs) {
    await mgmt.query(tr.def.replaceAll(`${origem}.`, `${destino}.`));
  }

  // 4) Views. `definition` já vem qualificada com o schema origem (fora do
  //    search_path). Recria em passes porque uma view pode depender de outra.
  const views = (await mgmt.query(
    'SELECT viewname, definition FROM pg_views WHERE schemaname = $1', [origem],
  )).rows;
  let pendentes = views.map((v) => ({
    nome: v.viewname,
    sql: `CREATE VIEW ${destino}.${ident(v.viewname)} AS ${v.definition.replaceAll(`${origem}.`, `${destino}.`)}`,
  }));
  let anterior = Infinity;
  while (pendentes.length && pendentes.length < anterior) {
    anterior = pendentes.length;
    const falhou = [];
    for (const v of pendentes) {
      try { await mgmt.query(v.sql); } catch { falhou.push(v); }
    }
    pendentes = falhou;
  }
  if (pendentes.length) {
    throw new Error(`Falha ao clonar views: ${pendentes.map((v) => v.nome).join(', ')}`);
  }
}

/** Cria a oficina em public.oficinas e um admin em public.users. */
async function provisionarOficina(mgmt, { slug, nome, email, senhaHash }) {
  const of = (await mgmt.query(
    'INSERT INTO oficinas (slug, nome) VALUES ($1, $2) RETURNING id', [slug, nome],
  )).rows[0];
  await mgmt.query(
    `INSERT INTO users (nome, email, senha_hash, role, oficina_id)
     VALUES ($1, $2, $3, 'admin', $4)`,
    [`Admin ${slug}`, email, senhaHash, of.id],
  );
  return of.id;
}

/** Semeia um registro de cada tipo dentro do schema da oficina. */
async function semear(mgmt, slug, { telefone, placa, osPaga }) {
  await mgmt.query(`SET search_path TO oficina_${slug}, public`);
  try {
    const cli = (await mgmt.query(
      'INSERT INTO clientes (nome, telefone) VALUES ($1, $2) RETURNING id',
      [`Cliente ${slug}`, telefone],
    )).rows[0];
    const carro = (await mgmt.query(
      "INSERT INTO carros (cliente_id, placa, marca, modelo) VALUES ($1, $2, 'VW', 'Gol') RETURNING id",
      [cli.id, placa],
    )).rows[0];
    const os = (await mgmt.query(
      'INSERT INTO ordens_servico (cliente_id, carro_id) VALUES ($1, $2) RETURNING id',
      [cli.id, carro.id],
    )).rows[0];
    await mgmt.query(
      "INSERT INTO os_servicos (os_id, nome_servico, quantidade, valor_unit) VALUES ($1, 'Serviço teste', 1, 100)",
      [os.id],
    );
    if (osPaga) {
      await mgmt.query(
        `UPDATE ordens_servico
            SET status='paga', fechada_em=now(), paga_em=now(),
                forma_pagamento='dinheiro'
          WHERE id=$1`,
        [os.id],
      );
    }
    const forn = (await mgmt.query(
      'INSERT INTO fornecedores (nome) VALUES ($1) RETURNING id', [`Fornecedor ${slug}`],
    )).rows[0];
    const desp = (await mgmt.query(
      "INSERT INTO despesas (descricao, valor, forma, competencia) VALUES ($1, 100, 'pix', CURRENT_DATE) RETURNING id",
      [`Despesa ${slug}`],
    )).rows[0];
    const anexo = (await mgmt.query(
      "INSERT INTO os_anexos (os_id, arquivo, mime, tamanho) VALUES ($1, $2, 'image/png', 10) RETURNING id",
      [os.id, `os/${os.id}/foto.png`],
    )).rows[0];
    const wa = (await mgmt.query(
      `INSERT INTO wa_messages (wa_message_id, direction, telefone, body, cliente_id)
       VALUES ($1, 'inbound', $2, $3, $4) RETURNING id`,
      [`wamid.${slug}.1`, telefone, `oi de ${slug}`, cli.id],
    )).rows[0];
    return {
      cliente: cli.id, carro: carro.id, os: os.id, fornecedor: forn.id,
      despesa: desp.id, anexo: anexo.id, wa: wa.id, telefone,
    };
  } finally {
    await mgmt.query('RESET search_path');
  }
}

async function limpar(mgmt) {
  await mgmt.query(
    "DELETE FROM users WHERE oficina_id IN (SELECT id FROM oficinas WHERE slug IN ('ta','tb'))",
  );
  await mgmt.query("DELETE FROM oficinas WHERE slug IN ('ta','tb')");
  await mgmt.query('DROP SCHEMA IF EXISTS oficina_ta CASCADE');
  await mgmt.query('DROP SCHEMA IF EXISTS oficina_tb CASCADE');
}

function makeApi(base) {
  return async function apiFetch(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data = null;
    try { data = await res.json(); } catch { /* 204/sem corpo */ }
    return { status: res.status, data };
  };
}

async function setup() {
  assertBancoDeTeste(TEST_URL);

  const mgmt = new Client({ connectionString: TEST_URL });
  await mgmt.connect();

  const temModelo = (await mgmt.query(
    "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'oficina_maninho'",
  )).rowCount;
  if (!temModelo) {
    await mgmt.end();
    throw new Error(
      'Schema-modelo oficina_maninho não existe no banco de teste. Rode as migrations '
      + 'nesse banco primeiro (DATABASE_URL apontando pro banco de teste: npm run migrate).',
    );
  }

  dbg('limpando artefatos anteriores');
  await limpar(mgmt);
  dbg('clonando oficina_ta');
  await clonarSchema(mgmt, 'oficina_maninho', 'oficina_ta');
  dbg('clonando oficina_tb');
  await clonarSchema(mgmt, 'oficina_maninho', 'oficina_tb');
  dbg('schemas clonados');

  const senha = 'teste123456';
  const senhaHash = await bcrypt.hash(senha, 4); // rounds baixos: é banco de teste
  await provisionarOficina(mgmt, { slug: 'ta', nome: 'Oficina TA', email: 'admin@ta.test', senhaHash });
  await provisionarOficina(mgmt, { slug: 'tb', nome: 'Oficina TB', email: 'admin@tb.test', senhaHash });

  // A não tem OS paga (faturamento 0); B tem (faturamento 100) — prova
  // isolamento também na camada de relatórios.
  dbg('semeando ta');
  const idsA = await semear(mgmt, 'ta', { telefone: '+5551999990001', placa: 'TAA1A11', osPaga: false });
  dbg('semeando tb');
  const idsB = await semear(mgmt, 'tb', { telefone: '+5551999990002', placa: 'TBB2B22', osPaga: true });

  // Só agora aponta o pool do app pro banco de teste e sobe o servidor.
  dbg('subindo app');
  process.env.DATABASE_URL = TEST_URL;
  const app = require('../../src/app');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  dbg('app ouvindo; logando');
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const api = makeApi(base);

  const loginA = await api('/api/auth/login', {
    method: 'POST', body: { email: 'admin@ta.test', senha, oficina_slug: 'ta' },
  });
  const loginB = await api('/api/auth/login', {
    method: 'POST', body: { email: 'admin@tb.test', senha, oficina_slug: 'tb' },
  });
  if (loginA.status !== 200 || loginB.status !== 200) {
    await new Promise((r) => server.close(r));
    await mgmt.end();
    throw new Error(`Login de teste falhou: A=${loginA.status} B=${loginB.status}`);
  }

  async function teardown() {
    await new Promise((r) => server.close(r));
    await limpar(mgmt);
    await mgmt.end();
    await require('../../src/config/db').pool.end();
  }

  return {
    api,
    tokenA: loginA.data.token,
    tokenB: loginB.data.token,
    idsA,
    idsB,
    teardown,
  };
}

module.exports = { setup };
