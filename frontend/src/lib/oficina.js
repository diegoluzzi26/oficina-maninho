import { useEffect, useState } from 'react';
import { api, getUser } from './api';

/**
 * Identidade visual da oficina logada (nome, logo e as 2 cores).
 *
 * Cache em módulo: sidebar, impressão e Configurações leem a mesma
 * resposta. Quando o admin salva em Configurações, `publicarIdentidade`
 * atualiza todo mundo que está com o hook montado, sem recarregar a página.
 */

export const COR_PRIMARIA_PADRAO = '#6e44ff';   // maninho-600 (Gestão Torque)
export const COR_SECUNDARIA_PADRAO = '#ff5a36'; // ouro-500

let cache = null;
let pendente = null;
const ouvintes = new Set();

/** Completa a resposta da API com URL da logo e cores efetivas. */
export function normalizarIdentidade(o) {
  if (!o) return null;
  return {
    ...o,
    logo_url: o.logo_versao ? api.urlLogoOficina(o.slug, o.logo_versao) : null,
    primaria: o.cor_primaria || COR_PRIMARIA_PADRAO,
    secundaria: o.cor_secundaria || COR_SECUNDARIA_PADRAO,
  };
}

export function publicarIdentidade(o) {
  cache = normalizarIdentidade(o);
  ouvintes.forEach((fn) => fn(cache));
}

// Cache só vale pra oficina do usuário logado (troca de login na mesma aba).
const valido = () => cache && cache.slug === getUser()?.oficina_slug;

export function useIdentidadeOficina() {
  const [ident, setIdent] = useState(valido() ? cache : null);
  useEffect(() => {
    ouvintes.add(setIdent);
    if (!valido()) {
      pendente = pendente || api.minhaOficina()
        .then(publicarIdentidade)
        .catch(() => {})
        .finally(() => { pendente = null; });
    }
    return () => { ouvintes.delete(setIdent); };
  }, []);
  return ident;
}

/** Texto legível (branco ou quase-preto) sobre um fundo #rrggbb. */
export function corTextoSobre(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (Number.isNaN(n)) return '#ffffff';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#1f1a24' : '#ffffff';
}

/** Iniciais a partir do nome da oficina (até 2 letras). */
export function iniciais(nome = '') {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || 'OF';
}
