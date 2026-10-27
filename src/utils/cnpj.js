'use strict';

/**
 * Validação de CNPJ, numérico e alfanumérico (Receita, a partir de
 * jul/2026: 12 posições [0-9A-Z] + 2 dígitos verificadores numéricos).
 * O DV usa o mesmo módulo 11 de sempre, com cada caractere valendo
 * (código ASCII − 48): '0'..'9' = 0..9, 'A' = 17 … 'Z' = 42.
 */

/** Tira máscara (pontos, barra, traço) e põe em maiúsculas. */
function limpar(v) {
  return String(v || '').replace(/[.\-/\s]/g, '').toUpperCase();
}

function dv(base) {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i -= 1) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function valido(v) {
  const c = limpar(v);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // 00000000000000, 11111111111111...
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

module.exports = { limpar, valido };
