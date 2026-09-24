/**
 * Paginação reutilizável. Recebe o objeto `paginacao` que o backend devolve
 * ({ pagina, por_pagina, total, paginas }) e dispara callbacks quando o
 * usuário muda de página ou de tamanho de página.
 *
 * Uso:
 *   <Paginacao paginacao={lista.paginacao}
 *              onPagina={(n) => setPagina(n)}
 *              onPorPagina={(n) => { setPorPagina(n); setPagina(1); }}
 *              resumo={<span>Total {brl(lista.paginacao.total_valor)}</span>} />
 *
 * `resumo` é opcional: um nó renderizado à esquerda (ex.: soma do filtro).
 */

const OPCOES_POR_PAGINA = [20, 50, 100];

/** Gera a sequência de páginas com reticências: 1 … 4 5 [6] 7 8 … 20 */
function janela(atual, total) {
  const paginas = [];
  const perto = (n) => Math.abs(n - atual) <= 1;
  for (let n = 1; n <= total; n += 1) {
    if (n === 1 || n === total || perto(n)) {
      paginas.push(n);
    } else if (paginas[paginas.length - 1] !== '…') {
      paginas.push('…');
    }
  }
  return paginas;
}

export default function Paginacao({ paginacao, onPagina, onPorPagina, resumo }) {
  if (!paginacao) return null;
  const { pagina, por_pagina: porPagina, total, paginas } = paginacao;
  if (!total) return null;

  const primeiro = (pagina - 1) * porPagina + 1;
  const ultimo = Math.min(pagina * porPagina, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200
                    bg-slate-50/60 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="tnum text-xs text-slate-500">
          {primeiro}–{ultimo} de {total}
        </span>
        {resumo}
        {onPorPagina && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="hidden sm:inline">Por página</span>
            <select
              className="input w-auto py-1 text-xs"
              value={porPagina}
              onChange={(e) => onPorPagina(Number(e.target.value))}
            >
              {OPCOES_POR_PAGINA.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {paginas > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginação">
          <button
            className="btn-ghost px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onPagina(pagina - 1)}
            disabled={pagina <= 1}
            aria-label="Página anterior"
          >
            ◀
          </button>

          {janela(pagina, paginas).map((n, i) => (n === '…' ? (
            <span key={`e${i}`} className="px-1.5 text-xs text-slate-400">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onPagina(n)}
              aria-current={n === pagina ? 'page' : undefined}
              className={`tnum min-w-[30px] rounded px-2 py-1 text-xs font-semibold transition
                ${n === pagina
                  ? 'bg-maninho-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {n}
            </button>
          )))}

          <button
            className="btn-ghost px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => onPagina(pagina + 1)}
            disabled={pagina >= paginas}
            aria-label="Próxima página"
          >
            ▶
          </button>
        </nav>
      )}
    </div>
  );
}
