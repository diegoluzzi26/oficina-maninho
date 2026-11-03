'use strict';
const db = require('../config/db');
const { semAcento, chave } = require('../utils/semelhanca');

/**
 * Tabela NCM oficial (public.ncm), usada pra validar e sugerir o NCM das
 * peças. Fonte: download público do Portal Único Siscomex (JSON, sem login).
 *
 * O JSON traz a árvore inteira (capítulo "87", posição "87.08", subposição
 * "8708.30", item "8708.30.1", subitem "8708.30.90"). Só os códigos de 8
 * dígitos vão na NF-e; a descrição deles sozinha costuma ser "Outros", então
 * guardamos também a descrição completa com os níveis de cima.
 */

const URL_SISCOMEX = process.env.NCM_URL
  || 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json?perfil=PUBLICO';
const MAX_IDADE_DIAS = 30;

const limparDescricao = (d) => String(d || '')
  .replace(/<[^>]+>/g, '') // <i>, <sup> do texto oficial
  .replace(/ /g, ' ')
  .replace(/^[\s-]+/, '')
  .replace(/\s+/g, ' ')
  .trim();
const dataBR = (d) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** JSON do Siscomex -> linhas de 8 dígitos vigentes, com a descrição completa. */
function linhasDoJson(json, hoje = new Date().toISOString().slice(0, 10)) {
  const nomenclaturas = json?.Nomenclaturas || [];
  const porDigitos = new Map();
  for (const n of nomenclaturas) {
    const fim = dataBR(n.Data_Fim);
    if (fim && fim < hoje) continue;
    porDigitos.set(String(n.Codigo).replace(/\D/g, ''), limparDescricao(n.Descricao));
  }
  const linhas = [];
  for (const n of nomenclaturas) {
    const cod = String(n.Codigo).replace(/\D/g, '');
    if (cod.length !== 8 || porDigitos.get(cod) === undefined) continue;
    const fim = dataBR(n.Data_Fim);
    if (fim && fim < hoje) continue;
    const niveis = [2, 4, 5, 6, 7]
      .map((t) => porDigitos.get(cod.slice(0, t)))
      .filter(Boolean);
    const propria = porDigitos.get(cod);
    const completa = [...niveis, propria].join(' > ');
    linhas.push({
      codigo: cod,
      descricao: propria,
      descricao_completa: completa,
      busca: semAcento(completa).toLowerCase(),
      data_inicio: dataBR(n.Data_Inicio),
      data_fim: fim && fim < '9999-01-01' ? fim : null,
    });
  }
  return linhas;
}

/** Troca a tabela inteira numa transação. */
async function gravar(json) {
  const linhas = linhasDoJson(json);
  if (linhas.length < 5000) throw new Error(`Tabela NCM incompleta (${linhas.length} códigos)`);
  const col = (k) => linhas.map((l) => l[k]);
  await db.withTransaction(async (client) => {
    await client.query('DELETE FROM public.ncm');
    await client.query(
      `INSERT INTO public.ncm (codigo, descricao, descricao_completa, busca, data_inicio, data_fim)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::date[], $6::date[])`,
      [col('codigo'), col('descricao'), col('descricao_completa'), col('busca'), col('data_inicio'), col('data_fim')],
    );
    await client.query(
      `INSERT INTO public.ncm_importacao (id, ato, vigencia, total, importada_em)
       VALUES (true, $1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET ato = EXCLUDED.ato, vigencia = EXCLUDED.vigencia,
         total = EXCLUDED.total, importada_em = now()`,
      [json.Ato || null, json.Data_Ultima_Atualizacao_NCM || null, linhas.length],
    );
  });
  return { total: linhas.length, ato: json.Ato, vigencia: json.Data_Ultima_Atualizacao_NCM };
}

async function baixar() {
  const res = await fetch(URL_SISCOMEX, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Siscomex respondeu HTTP ${res.status}`);
  return res.json();
}

async function importar() {
  return gravar(await baixar());
}

/** Na subida da api: importa se a tabela está vazia ou tem mais de 30 dias. Não bloqueia. */
function atualizarSeVelha() {
  (async () => {
    const { rows: [i] } = await db.pool.query(
      `SELECT importada_em < now() - make_interval(days => $1) AS velha FROM public.ncm_importacao`,
      [MAX_IDADE_DIAS]);
    if (i && !i.velha) return;
    const r = await importar();
    console.log(`[ncm] tabela importada: ${r.total} códigos (${r.vigencia || 'sem data'})`);
  })().catch((err) => console.error(`[ncm] não atualizou a tabela: ${err.message}`));
}

async function situacao() {
  const { rows: [i] } = await db.pool.query('SELECT ato, vigencia, total, importada_em FROM public.ncm_importacao');
  return i || null;
}

/**
 * Radical da palavra: "fusivel" -> "fusiv" pega "fusíveis"; "lampada" ->
 * "lampa" pega "lâmpadas". Casado no começo de palavra.
 */
const radical = (p) => (p.length <= 5 ? p : p.slice(0, Math.max(5, p.length - 2)));

/**
 * Regex (texto sem acento) da palavra: palavra curta só aceita plural
 * ("rele" pega "reles", não "relevo"); a longa vai pelo radical.
 */
function padrao(p) {
  const r = radical(p);
  const fim = r === p ? '(s|es)?' : '[a-z]{0,4}';
  return `(^|[^a-z0-9])${r}${fim}([^a-z0-9]|$)`;
}

// Palavras de balcão que não ajudam a achar o NCM (e excluiriam o certo).
const GENERICAS = new Set([
  'motor', 'carro', 'auto', 'automotivo', 'automotiva', 'veiculo', 'kit', 'jogo', 'par', 'conjunto',
  'dianteiro', 'dianteira', 'traseiro', 'traseira', 'esquerdo', 'esquerda', 'direito', 'direita',
  'lado', 'original', 'novo', 'nova', 'universal',
]);

/**
 * Nome de balcão -> palavra que a tabela oficial usa. Só troca o termo da
 * busca; o código quem escolhe é a oficina (com o contador).
 */
const SINONIMOS = {
  bateria: 'acumuladores arranque',
  pneu: 'pneumaticos',
  correia: 'correias transmissao',
  oleo: 'oleos lubrificantes',
  farol: 'aparelhos iluminacao',
  palheta: 'limpadores',
  escapamento: 'silenciosos',
};

// Capítulos onde mora quase tudo que uma oficina vende.
const CAPITULOS_OFICINA = new Set(['27', '34', '38', '40', '68', '70', '73', '83', '84', '85', '87', '90']);

/**
 * Pontua um candidato: palavra no próprio código e nos níveis logo acima
 * vale mais que lá no capítulo; texto de veículo/motor e capítulo típico de
 * oficina sobem.
 */
function pontuar(linha, padroes) {
  const niveis = semAcento(linha.descricao_completa).toLowerCase().split(' > ');
  const perto = niveis.slice(-3).join(' ');
  let p = 0;
  for (const pad of padroes) {
    const re = new RegExp(pad);
    if (re.test(niveis[niveis.length - 1])) p += 4;
    else if (re.test(perto)) p += 2;
    else p += 1;
  }
  if (/veiculo|automove|motor/.test(linha.busca)) p += 2;
  if (CAPITULOS_OFICINA.has(linha.codigo.slice(0, 2))) p += 1;
  return p;
}

/**
 * Busca por código (prefixo de dígitos) ou por palavras da descrição: todas
 * as palavras precisam aparecer (pelo radical, no começo de palavra, sem
 * acento). Resultado ordenado por pontuação. Só NCM vigente.
 */
async function buscar(termo, { limite = 20 } = {}) {
  const t = String(termo || '').trim();
  const dig = t.replace(/[.\s]/g, '');
  if (/^\d{2,8}$/.test(dig)) {
    const { rows } = await db.pool.query(
      `SELECT codigo, descricao, descricao_completa FROM public.ncm
        WHERE codigo LIKE $1 AND (data_fim IS NULL OR data_fim >= CURRENT_DATE)
        ORDER BY codigo LIMIT $2`, [`${dig}%`, limite]);
    return rows;
  }
  const padroes = semAcento(t).toLowerCase().split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3).slice(0, 6).map(padrao);
  if (!padroes.length) return [];
  const where = padroes.map((_, i) => `busca ~ $${i + 1}`).join(' AND ');
  const { rows } = await db.pool.query(
    `SELECT codigo, descricao, descricao_completa, busca FROM public.ncm
      WHERE ${where} AND (data_fim IS NULL OR data_fim >= CURRENT_DATE)
      LIMIT 3000`, padroes);
  return rows
    .map((r) => ({ ...r, pontos: pontuar(r, padroes) }))
    .sort((a, b) => b.pontos - a.pontos || a.codigo.localeCompare(b.codigo))
    .slice(0, limite)
    .map(({ codigo, descricao, descricao_completa }) => ({ codigo, descricao, descricao_completa }));
}

/**
 * Sugestões pra uma peça: busca pelas palavras do nome (com os sinônimos da
 * tabela oficial); sem resultado, só pela primeira palavra.
 */
async function sugerirParaPeca(nome) {
  const todas = chave(nome).replace(/\b\w*\d\w*\b/g, ' ').trim().split(/\s+/).filter(Boolean);
  const uteis = todas.filter((p) => !GENERICAS.has(p));
  const palavras = uteis.length ? uteis : todas;
  if (!palavras.length) return [];
  const termos = palavras.map((p) => SINONIMOS[p] || p);
  const achadas = await buscar(termos.join(' '), { limite: 8 });
  if (achadas.length) return achadas;
  return buscar(termos[0], { limite: 8 });
}

async function existe(codigo) {
  const { rows } = await db.pool.query(
    'SELECT 1 FROM public.ncm WHERE codigo = $1 AND (data_fim IS NULL OR data_fim >= CURRENT_DATE)', [codigo]);
  return rows.length > 0;
}

module.exports = {
  linhasDoJson, gravar, importar, atualizarSeVelha, situacao, buscar, sugerirParaPeca, existe,
};
