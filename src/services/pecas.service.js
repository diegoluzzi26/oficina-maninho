'use strict';
const db = require('../config/db');
const ncm = require('./ncm.service');
const { agrupar } = require('../utils/semelhanca');
const AppError = require('../utils/AppError');

/**
 * Catálogo de peças. Cresce sozinho conforme itens são lançados nas OS
 * (via os.service.garantirPecaNoCatalogo), mas também pode ser listado
 * e editado direto por aqui.
 *
 * Pra NF-e cada peça precisa do próprio NCM (e, em autopeças, do CEST).
 * `usos` = em quantas linhas de OS a peça aparece.
 */

const SELECT_PECA = `
  SELECT p.*, (SELECT count(*)::int FROM os_pecas op WHERE op.peca_id = p.id) AS usos
    FROM pecas p`;

async function listar({ busca, incluir_inativos, sem_ncm } = {}) {
  const params = []; const where = [];
  if (!incluir_inativos) where.push('p.ativo = TRUE');
  if (sem_ncm) where.push('p.ncm IS NULL');
  if (busca) { params.push(`%${busca}%`); where.push(`p.nome ILIKE $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(`${SELECT_PECA} ${clause} ORDER BY p.nome`, params);
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await db.query(`${SELECT_PECA} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw AppError.notFound('Peça não encontrada');
  return rows[0];
}

/** NCM tem que existir na tabela oficial (se ela já foi importada). */
async function validarNcm(codigo) {
  if (!codigo) return;
  if (!(await ncm.situacao())) return; // tabela ainda não carregada: vale só o formato
  if (!(await ncm.existe(codigo))) {
    throw new AppError(`NCM ${codigo} não existe na tabela oficial vigente`, 422,
      [{ campo: 'ncm', erro: 'NCM inexistente ou fora de vigência' }]);
  }
}

async function atualizar(id, d) {
  await validarNcm(d.ncm);
  const campos = []; const params = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    params.push(v); campos.push(`${k} = $${params.length}`);
  }
  if (!campos.length) return buscarPorId(id);
  params.push(id);
  const { rows } = await db.query(
    `UPDATE pecas SET ${campos.join(', ')} WHERE id = $${params.length} RETURNING id`, params,
  );
  if (!rows[0]) throw AppError.notFound('Peça não encontrada');
  return buscarPorId(id);
}

/** Desativa em vez de apagar: OS antigas referenciam a peça via peca_id. */
async function desativar(id) {
  const { rows } = await db.query(
    'UPDATE pecas SET ativo = FALSE WHERE id = $1 RETURNING id', [id],
  );
  if (!rows[0]) throw AppError.notFound('Peça não encontrada');
  return buscarPorId(id);
}

/** Grupos de peças ativas com nomes parecidos, a mais usada primeiro. */
async function parecidas() {
  return agrupar(await listar());
}

/**
 * Junta `outras` na `principalId`: as linhas de OS passam a apontar pra
 * principal (o texto lançado na OS não muda) e as outras são desativadas.
 * Campos fiscais vazios na principal são herdados da primeira outra que tiver.
 */
async function unificar(principalId, outras) {
  const ids = [...new Set(outras)].filter((x) => x !== principalId);
  if (!ids.length) throw new AppError('Escolha ao menos uma peça para juntar', 422);
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, ativo, ncm, cest, cfop, unidade, intervalo_retorno_meses FROM pecas WHERE id = ANY($1::uuid[])',
      [[principalId, ...ids]]);
    const principal = rows.find((r) => r.id === principalId);
    if (!principal || !principal.ativo) throw AppError.notFound('Peça principal não encontrada');
    if (rows.length !== ids.length + 1) throw AppError.notFound('Alguma das peças não foi encontrada');

    const herdar = {};
    for (const campo of ['ncm', 'cest', 'cfop', 'unidade', 'intervalo_retorno_meses']) {
      if (principal[campo] !== null) continue;
      const fonte = ids.map((id) => rows.find((r) => r.id === id)).find((r) => r[campo] !== null);
      if (fonte) herdar[campo] = fonte[campo];
    }
    const chaves = Object.keys(herdar);
    if (chaves.length) {
      await client.query(
        `UPDATE pecas SET ${chaves.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [principalId, ...chaves.map((c) => herdar[c])]);
    }
    const { rowCount } = await client.query(
      'UPDATE os_pecas SET peca_id = $1 WHERE peca_id = ANY($2::uuid[])', [principalId, ids]);
    await client.query('UPDATE pecas SET ativo = FALSE WHERE id = ANY($1::uuid[])', [ids]);
    return { principal_id: principalId, juntadas: ids.length, linhas_de_os: rowCount };
  });
}

/**
 * Peças ativas sem NCM, cada uma com até 3 sugestões da tabela oficial,
 * pra revisão em lote no catálogo. As mais usadas vêm primeiro.
 */
async function sugestoesNcmLote({ limite = 500 } = {}) {
  const pecas = (await listar({ sem_ncm: true }))
    .sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome))
    .slice(0, limite);
  const out = [];
  for (const p of pecas) {
    const sugestoes = (await ncm.sugerirParaPeca(p.nome)).slice(0, 3);
    out.push({ id: p.id, nome: p.nome, usos: p.usos, sugestoes });
  }
  return out;
}

/**
 * Grava o NCM escolhido em várias peças de uma vez. Todos os códigos são
 * validados contra a tabela vigente antes; um inválido barra o lote inteiro.
 */
async function aplicarNcmLote(itens) {
  for (const it of itens) await validarNcm(it.ncm);
  return db.withTransaction(async (client) => {
    let atualizadas = 0;
    for (const it of itens) {
      const { rowCount } = await client.query(
        'UPDATE pecas SET ncm = $2 WHERE id = $1 AND ativo', [it.id, it.ncm]);
      atualizadas += rowCount;
    }
    return { atualizadas };
  });
}

/** Quantas peças ativas ainda estão sem NCM. */
async function resumo() {
  const { rows: [r] } = await db.query(
    `SELECT count(*)::int AS ativas, count(*) FILTER (WHERE ncm IS NULL)::int AS sem_ncm
       FROM pecas WHERE ativo`);
  return r;
}

module.exports = {
  listar, buscarPorId, atualizar, desativar, parecidas, unificar, resumo,
  sugestoesNcmLote, aplicarNcmLote,
};
