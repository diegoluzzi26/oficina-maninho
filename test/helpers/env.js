'use strict';
/**
 * Pré-carregado em todo arquivo de teste (`--require` no script `npm test`),
 * ANTES de qualquer require de `src/`.
 *
 * `src/config/env.js` exige DATABASE_URL já no import. Suítes que importam
 * serviços no topo do arquivo (agenda-online, cadastro, catalogo, fiscal...)
 * quebravam no load quando só TEST_DATABASE_URL estava definido.
 *
 * Com TEST_DATABASE_URL definido, ele vira o DATABASE_URL do processo de
 * teste — inclusive sobrepondo o do .env (o dotenv não sobrescreve variável
 * já definida), para nenhum teste falar com o banco de dev por engano.
 */
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
