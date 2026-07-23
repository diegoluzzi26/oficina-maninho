import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { brl, nomeMes, rotuloForma } from '../lib/format';
import { Skeleton, Alerta } from '../components/ui';
import Despesas from './Despesas';

/**
 * Aba "Despesas pessoais" — separada da contabilidade da oficina.
 * Mostra um mini-painel só das pessoais + a lista completa (reusa
 * a página Despesas passando escopo='pessoal').
 */

function Kpi({ titulo, valor, sub, tomValor = 'normal' }) {
  const cor = {
    normal: 'text-slate-800',
    vermelho: 'text-rose-600',
    verde: 'text-emerald-600',
  }[tomValor];
  return (
    <div className="card p-5">
      <p className="label">{titulo}</p>
      <p className={`numero mt-2 text-[26px] ${cor}`}>{valor}</p>
      {sub && <p className="mt-2 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function PainelPessoal() {
  const hoje = new Date();
  const [ref, setRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let cancelado = false;
    api.painelPessoal(ref)
      .then((d) => !cancelado && setDados(d))
      .catch((e) => !cancelado && setErro(e.message));
    return () => { cancelado = true; };
  }, [ref.ano, ref.mes]);

  function mudarMes(delta) {
    setRef((r) => {
      let m = r.mes + delta, a = r.ano;
      if (m > 12) { m = 1; a += 1; }
      if (m < 1)  { m = 12; a -= 1; }
      return { ano: a, mes: m };
    });
  }
  const eMesAtual = ref.ano === hoje.getFullYear() && ref.mes === hoje.getMonth() + 1;

  if (erro) return <Alerta tipo="erro">{erro}</Alerta>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="titulo-secao">Painel do mês</h2>
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white p-1 shadow-sm">
          <button onClick={() => mudarMes(-1)}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100">◀</button>
          <span className="tnum px-3 text-sm font-semibold text-slate-800">
            {nomeMes(ref.mes)}/{ref.ano}
          </span>
          <button onClick={() => mudarMes(1)} disabled={eMesAtual}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:text-slate-300">▶</button>
        </div>
      </div>

      {!dados ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[100px]" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi titulo="Total previsto" valor={brl(dados.total_previsto)}
              sub={`${dados.qtd} despesa${dados.qtd === 1 ? '' : 's'} no mês`} />
            <Kpi titulo="Já pago" valor={brl(dados.total_pago)} tomValor="verde"
              sub={`${dados.qtd - dados.qtd_pendente - dados.qtd_atrasada} paga${dados.qtd - dados.qtd_pendente - dados.qtd_atrasada === 1 ? '' : 's'}`} />
            <Kpi titulo="A pagar"
              valor={brl(dados.total_previsto - dados.total_pago)}
              tomValor={dados.qtd_atrasada > 0 ? 'vermelho' : 'normal'}
              sub={`${dados.qtd_pendente} pendente${dados.qtd_pendente === 1 ? '' : 's'}`} />
            <Kpi titulo="Atrasadas" valor={String(dados.qtd_atrasada)}
              tomValor={dados.qtd_atrasada > 0 ? 'vermelho' : 'normal'}
              sub={dados.qtd_atrasada > 0 ? 'Requer atenção' : 'Nada atrasado'} />
          </div>

          {dados.por_categoria.length > 0 && (
            <div className="card p-5">
              <p className="label mb-3">Por categoria</p>
              <ul className="space-y-1.5">
                {dados.por_categoria.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-sm"
                      style={{ background: c.cor || '#94a3b8' }} />
                    <span className="flex-1 text-slate-700">{c.categoria || 'Sem categoria'}</span>
                    <span className="text-xs text-slate-500">{c.qtd}×</span>
                    <span className="tnum w-24 text-right font-semibold text-slate-800">{brl(c.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dados.por_forma.length > 0 && (
            <div className="card p-5">
              <p className="label mb-3">Formas de pagamento (só as pagas)</p>
              <ul className="space-y-1.5">
                {dados.por_forma.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-slate-700">{rotuloForma(f.forma)}</span>
                    <span className="tnum w-24 text-right font-semibold text-slate-800">{brl(f.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Pessoal() {
  return (
    <div className="space-y-6">
      <PainelPessoal />
      <div className="border-t border-slate-200 pt-6">
        <Despesas escopo="pessoal" />
      </div>
    </div>
  );
}
