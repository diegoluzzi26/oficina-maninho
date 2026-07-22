'use strict';
const AppError = require('./AppError');

/**
 * Converte telefone digitado de qualquer jeito para E.164 (+5551998887777).
 *
 * O banco tem CHECK constraint em E.164, então normalizamos na entrada em vez
 * de deixar o INSERT estourar. Assume Brasil (+55) quando não há código de país,
 * que é o caso de 100% dos clientes da oficina.
 *
 * Aceita: "51998887777", "(51) 99888-7777", "+55 51 99888-7777", "055519988877 77"
 */
function toE164(input, defaultCountry = '55') {
  if (input === null || input === undefined) {
    throw new AppError('Telefone é obrigatório', 400);
  }

  const raw = String(input).trim();
  if (!raw) throw new AppError('Telefone é obrigatório', 400);

  const hadPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');

  if (!digits) {
    throw new AppError(`Telefone inválido: "${input}"`, 400);
  }

  if (!hadPlus) {
    // 00 é prefixo internacional discado no Brasil
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    } else if (digits.startsWith(defaultCountry) && digits.length >= 12) {
      // já vem com 55 na frente (ex: 5551998887777)
    } else {
      // número nacional: 51998887777 ou 9988877 7 (sem DDD não dá pra salvar)
      if (digits.length < 10) {
        throw new AppError(
          `Telefone inválido: "${input}". Informe com DDD, ex: (51) 99888-7777`,
          400,
        );
      }
      digits = defaultCountry + digits;
    }
  }

  const e164 = '+' + digits;

  // Mesma regra da CHECK constraint chk_telefone_e164 no banco
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw new AppError(`Telefone inválido: "${input}"`, 400);
  }

  return e164;
}

/** Formata E.164 para exibição: +5551998887777 -> (51) 99888-7777 */
function formatBR(e164) {
  if (typeof e164 !== 'string') return e164;
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

module.exports = { toE164, formatBR };
