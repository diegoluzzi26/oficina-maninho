import { STATUS } from '../lib/format';

export function Badge({ status }) {
  const s = STATUS[status] || STATUS.aberta;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px]
                      font-semibold ring-1 ring-inset ${s.classe}`}>
      {s.texto}
    </span>
  );
}

/** Skeleton evita o "pulo" de layout quando os dados chegam. */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-slate-200/70 ${className}`} />;
}

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function Alerta({ tipo = 'erro', children, onFechar }) {
  const cores = {
    erro: 'bg-rose-50 text-rose-800 border-rose-200',
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    aviso: 'bg-ouro-100 text-ouro-700 border-ouro-300',
  };
  return (
    <div className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${cores[tipo]}`}>
      <div className="flex-1">{children}</div>
      {onFechar && (
        <button onClick={onFechar} className="opacity-60 hover:opacity-100" aria-label="Fechar">✕</button>
      )}
    </div>
  );
}

export function Vazio({ titulo, descricao, acao }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <svg viewBox="0 0 64 30" className="mb-1 h-7 w-auto opacity-25" fill="none" aria-hidden="true">
        <path d="M2 27C10 9 26 2 44 2" stroke="#283090" strokeWidth="5.5" strokeLinecap="round"/>
        <path d="M20 27C26 15 36 9 48 8" stroke="#283090" strokeOpacity=".5" strokeWidth="4.5" strokeLinecap="round"/>
      </svg>
      <p className="font-display text-base font-semibold uppercase tracking-wide text-slate-600">{titulo}</p>
      {descricao && <p className="max-w-sm text-sm text-slate-500">{descricao}</p>}
      {acao}
    </div>
  );
}

export function Modal({ aberto, titulo, onFechar, children, largura = 'max-w-lg' }) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
                    bg-painel-950/50 p-4 backdrop-blur-[2px] sm:p-8"
         onClick={onFechar}>
      <div className={`anima w-full ${largura} card my-4 overflow-hidden`}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h3 className="font-display text-lg font-semibold text-maninho-800">{titulo}</h3>
          <button onClick={onFechar}
                  className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Fechar">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ label, erro, children, obrigatorio, ajuda }) {
  return (
    <label className="block">
      <span className="label mb-1.5 block">
        {label} {obrigatorio && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {ajuda && !erro && <span className="mt-1 block text-[11px] text-slate-500">{ajuda}</span>}
      {erro && <span className="mt-1 block text-xs text-rose-600">{erro}</span>}
    </label>
  );
}
