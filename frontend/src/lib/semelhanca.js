
/**
 * Semelhança de nomes do catálogo ("Lâmpadas" ≈ "lampada", "sensor
 * temperatura" ≈ "Sensor de temperatura"). Cópia de
 * src/utils/semelhanca.js (backend) — mudou lá, mude aqui.
 *
 * chave():   forma normalizada. Duas peças com a mesma chave são a mesma
 *            coisa escrita diferente (acento, caixa, plural, "de/do/para").
 * similar(): 0..1 pelos trigramas das chaves (Dice). Pega erro de digitação
 *            ("termostatica" x "termostática", "fusivel" x "fuzivel").
 */

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'p', 'para', 'pra', 'com', 'c', 'em', 'a', 'o']);

function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Singular simples do português, só pro que costuma aparecer em peça. */
function singular(p) {
  if (p.length <= 3) return p;
  if (/oes$|aes$/.test(p)) return `${p.slice(0, -3)}ao`; // botões, mamões
  if (/ais$/.test(p)) return `${p.slice(0, -2)}l`;        // radiais -> radial
  if (/eis$/.test(p)) return `${p.slice(0, -3)}el`;       // fusíveis -> fusivel
  if (/res$|zes$/.test(p)) return p.slice(0, -2);         // motores, luzes
  if (/ns$/.test(p)) return `${p.slice(0, -2)}m`;         // borrachagens? -> m
  if (/s$/.test(p) && !/ss$|us$|is$/.test(p)) return p.slice(0, -1);
  return p;
}

function chave(nome) {
  return semAcento(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .map(singular)
    .join(' ');
}

function trigramas(s) {
  const t = new Set();
  const x = `  ${s} `;
  for (let i = 0; i < x.length - 2; i += 1) t.add(x.slice(i, i + 3));
  return t;
}

// "20a", "60 ah", "h4" -> números da chave, juntos ("bateria 60 ah" = "60ah").
const numeros = (k) => (k.replace(/\s+/g, '').match(/\d+/g) || []).join(',');

function similar(a, b) {
  const ka = chave(a);
  const kb = chave(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  // Medida/modelo diferente é outra peça: fusível 20A ≠ fusível 30A.
  const na = numeros(ka);
  const nb = numeros(kb);
  if (na && nb && na !== nb) return 0;
  const ta = trigramas(ka);
  const tb = trigramas(kb);
  let comum = 0;
  for (const g of ta) if (tb.has(g)) comum += 1;
  return (2 * comum) / (ta.size + tb.size);
}

const LIMIAR = 0.72;

/**
 * Agrupa itens ({ id, nome, ... }) parecidos entre si. Devolve só grupos com
 * 2+ itens, cada grupo ordenado do item mais usado pro menos (`usos`).
 */
function agrupar(itens, limiar = LIMIAR) {
  const pai = itens.map((_, i) => i);
  const raiz = (i) => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  const chaves = itens.map((it) => chave(it.nome));
  for (let i = 0; i < itens.length; i += 1) {
    for (let j = i + 1; j < itens.length; j += 1) {
      if (!chaves[i] || !chaves[j]) continue;
      if (chaves[i] === chaves[j] || similar(itens[i].nome, itens[j].nome) >= limiar) {
        pai[raiz(i)] = raiz(j);
      }
    }
  }
  const grupos = new Map();
  itens.forEach((it, i) => {
    const r = raiz(i);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(it);
  });
  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((a, b) => (b.usos || 0) - (a.usos || 0) || a.nome.localeCompare(b.nome)));
}

/** O item mais parecido com `nome` (>= limiar), ou null. */
function maisParecido(nome, itens, limiar = LIMIAR) {
  let melhor = null;
  let nota = 0;
  for (const it of itens) {
    const s = similar(nome, it.nome);
    if (s > nota) { nota = s; melhor = it; }
  }
  return nota >= limiar ? { item: melhor, nota } : null;
}

export { chave, similar, agrupar, maisParecido, semAcento, LIMIAR };
