/**
 * Versão do sistema, pra bater o olho e saber o que está no ar.
 *
 * `__APP_VERSION__`, `__APP_COMMIT__` e `__BUILD_TIME__` são injetados no
 * build pelo Vite (ver vite.config.js). A versão é major.minor do
 * package.json + número do build (contagem de commits), então muda a cada
 * deploy com código novo; o build time é o instante do `npm run build`.
 */

/* global __APP_VERSION__, __APP_COMMIT__, __BUILD_TIME__ */
export const VERSAO = __APP_VERSION__;
export const COMMIT = __APP_COMMIT__;
export const BUILD_ISO = __BUILD_TIME__;

const d = new Date(BUILD_ISO);
export const BUILD_DATA = isNaN(d)
  ? ''
  : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Ex.: "v1.1.182 · 11/11/26" */
export const VERSAO_ROTULO = BUILD_DATA ? `v${VERSAO} · ${BUILD_DATA}` : `v${VERSAO}`;

/** Texto completo pro title/tooltip, com commit e data/hora do build. */
export const VERSAO_DETALHE = [
  `Versão ${VERSAO}`,
  COMMIT ? `commit ${COMMIT}` : '',
  isNaN(d) ? '' : `build ${d.toLocaleString('pt-BR')}`,
].filter(Boolean).join(' · ');
