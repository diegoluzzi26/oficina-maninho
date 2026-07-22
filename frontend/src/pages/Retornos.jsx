import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { data, telefone } from '../lib/format';
import { Skeleton, Alerta, Vazio } from '../components/ui';

const ABAS = [
  { chave: 'pendente', texto: 'Pendentes' },
  { chave: 'contatado', texto: 'Contatados' },
  { chave: 'ignorado', texto: 'Ignorados' },
];

function Chip({ dias }) {
  if (dias < 0) return (
    <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
      {-dias}d atrasado
    </span>
  );
  if (dias === 0) return (
    <span className="rounded bg-ouro-100 px-2 py-0.5 text-[11px] font-semibold text-ouro-700">
      hoje
    </span>
  );
  if (dias <= 7) return (
    <span className="rounded bg-maninho-50 px-2 py-0.5 text-[11px] font-semibold text-maninho-700">
      em {dias}d
    </span>
  );
  return (
    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
      em {dias}d
    </span>
  );
}

export default function Retornos() {
  const [aba, setAba] = useState('pendente');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    setErro('');
    api.retornos({ status: aba, busca })
      .then(setLista).catch((e) => setErro(e.message));
  }, [aba, busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  async function contatar(r) {
    setErro('');
    try {
      await api.marcarRetornoContatado(r.id);
      carregar();
    } catch (e) { setErro(e.message); }
  }
  async function ignorar(r) {
    setErro('');
    try {
      await api.ignorarRetorno(r.id);
      carregar();
    } catch (e) { setErro(e.message); }
  }
  async function remover(r) {
    if (!confirm(`Remover o retorno de ${r.cliente_nome}?`)) return;
    setErro('');
    try {
      await api.removerRetorno(r.id);
      carregar();
    } catch (e) { setErro(e.message); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Retornos</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Clientes para chamar de volta com base no intervalo configurado no catálogo (ex: troca de óleo → 6 meses).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
          {ABAS.map((a) => (
            <button key={a.chave} onClick={() => setAba(a.chave)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition
                ${aba === a.chave ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {a.texto}
            </button>
          ))}
        </div>
        <input className="input max-w-xs" placeholder="Buscar cliente, placa ou serviço…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      <div className="card overflow-hidden">
        {!lista ? (
          <div className="space-y-2 p-4">
            {[0,1,2,3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : lista.length === 0 ? (
          <Vazio titulo={aba === 'pendente' ? 'Nenhum retorno pendente' : 'Nada aqui'}
            descricao={aba === 'pendente'
              ? 'Configure o intervalo de retorno em serviços do catálogo (ex: troca de óleo → 6 meses).'
              : ''} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/80">
                <tr>
                  <th className="th">Cliente</th>
                  <th className="th">Serviço</th>
                  <th className="th w-24">Placa</th>
                  <th className="th w-28">Data</th>
                  <th className="th w-28">Situação</th>
                  <th className="th w-32 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((r) => (
                  <tr key={r.id} className="hover:bg-maninho-50/40">
                    <td className="td">
                      <p className="font-medium text-slate-800">{r.cliente_nome}</p>
                      <p className="text-xs text-slate-500">{telefone(r.cliente_telefone)}</p>
                    </td>
                    <td className="td text-sm text-slate-700">{r.servico_nome || r.motivo || '—'}</td>
                    <td className="td font-mono text-xs font-semibold text-slate-700">{r.placa || '—'}</td>
                    <td className="td text-xs text-slate-600">{data(r.agendado_para)}</td>
                    <td className="td">
                      {aba === 'pendente'
                        ? <Chip dias={r.dias_para} />
                        : (
                          <span className="text-xs text-slate-500">
                            {aba === 'contatado' ? `contatado ${r.contatado_em ? data(r.contatado_em) : ''}` : 'ignorado'}
                          </span>
                        )}
                    </td>
                    <td className="td text-right">
                      {aba === 'pendente' ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          <button onClick={() => contatar(r)}
                            className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">
                            ✓ Contatado
                          </button>
                          <button onClick={() => ignorar(r)}
                            className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">
                            Ignorar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => remover(r)}
                          className="text-[11px] font-semibold text-rose-600 hover:underline">
                          remover
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
