'use strict';
/**
 * Pré-carregado em todo arquivo de teste (`--require` no script `npm test`),
 * ANTES de qualquer require de `src/`.
 *
 * `src/config/env.js` exige DATABASE_URL e JWT_SECRET já no import. Suítes
 * que importam serviços no topo do arquivo (agenda-online, cadastro,
 * catalogo, fiscal...) quebravam no load quando faltava alguma das duas.
 *
 * 1. Carrega o .env, se existir (mesmo comportamento do app).
 * 2. Com TEST_DATABASE_URL definido, ele vira o DATABASE_URL do processo de
 *    teste — sobrepondo o do .env, para nenhum teste falar com o banco de dev.
 * 3. Sem JWT_SECRET (nem no ambiente, nem no .env), gera um aleatório só para
 *    este processo. Os tokens são emitidos e conferidos no mesmo processo, então
 *    não precisa ser fixo — e nenhum segredo fica no código.
 */
const crypto = require('crypto');

require('dotenv').config();

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
}
