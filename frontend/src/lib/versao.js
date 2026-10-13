/**
 * Versão do sistema, pra bater o olho e saber o que está no ar.
 *
 * `__APP_VERSION__` e `__BUILD_TIME__` são injetados no build pelo Vite
 * (ver vite.config.js). A versão vem do package.json; o build time é o
 * instante do `npm run build` — como o container web reconstrói a cada
 * deploy, a data muda sozinha e confirma que a versão nova subiu.
 */

/* global __APP_VERSION__, __BUILD_TIME__ */
export const VERSAO = __APP_VERSION__;
export const BUILD_ISO = __BUILD_TIME__;

const d = new Date(BUILD_ISO);
export const BUILD_DATA = isNaN(d)
  ? ''
  : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Ex.: "v1.0.0 · 13/10/26" */
export const VERSAO_ROTULO = BUILD_DATA ? `v${VERSAO} · ${BUILD_DATA}` : `v${VERSAO}`;

/** Texto completo pro title/tooltip, com data e hora do build. */
export const VERSAO_DETALHE = isNaN(d)
  ? `Versão ${VERSAO}`
  : `Versão ${VERSAO} · build ${d.toLocaleString('pt-BR')}`;
