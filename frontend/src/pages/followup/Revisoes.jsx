import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, X, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { data, nomeMes } from '../../lib/format';
import { Skeleton, Alerta, Vazio } from '../../components/ui';
import { NovoRetorno, EditarRetorno } from './RevisaoModais';

/**
 * Agenda de revisões: o que vai vencer (serviços e peças com intervalo no
 * catálogo, ou agendado à mão). Cada uma entra sozinha em "Para enviar"
 * quando faltar o prazo configurado na automação Revisão. Aqui só se
 * ajusta a data ou se descarta.
 */

function quandoVence(dias) {
  if (dias < 0) return { texto: dias === -1 ? 'venceu ontem' : `venceu há ${-dias} dias`, alerta: true };
  if (dias === 0) return { texto: 'vence hoje', alerta: true };
  if (dias === 1) return { texto: 'vence amanhã' };
  return { texto: `em ${dias} dias` };
}

export default function Revisoes({ antecedencia }) {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(() => {
    setErro('');
    api.retornos({ status: 'pendente', busca: busca || undefined })
      .then(setLista).catch((e) => setErro(e.message));
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  async function descartar(r) {
    if (!confirm(`Descartar a revisão de ${r.cliente_nome}? Ela não vai mais para a fila.`)) return;
    try { await api.ignorarRetorno(r.id); carregar(); } catch (e) { setErro(e.message); }
  }

  // Agrupa por mês de vencimento; o que já venceu fica junto no topo.
  const grupos = useMemo(() => {
    const g = new Map();
    for (const r of lista || []) {
      const d = new Date(`${String(r.agendado_para).slice(0, 10)}T00:00:00`);
      const chave = r.dias_para < 0 ? 'vencidas' : `${d.getFullYear()}-${d.getMonth() + 1}`;
      const titulo = r.dias_para < 0 ? 'Vencidas' : `${nomeMes(d.getMonth() + 1)} de ${d.getFullYear()}`;
      if (!g.has(chave)) g.set(chave, { titulo, itens: [] });
      g.get(chave).itens.push(r);
    }
    return [...g.values()];
  }, [lista]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-slate-500">
          Cada revisão entra sozinha em Para enviar {antecedencia != null ? `${antecedencia} dias antes de vencer` : 'perto de vencer'}.
          Elas nascem quando uma OS é paga com serviço ou peça que tem intervalo no catálogo.
        </p>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-64 sm:flex-none">
            <span className="sr-only">Buscar cliente, placa ou serviço</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Buscar cliente, placa ou serviço"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <button type="button" className="btn-ghost" onClick={() => setNovo(true)}>
            <Plus className="h-4 w-4" /> Agendar revisão
          </button>
        </div>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!lista ? (
        <Skeleton className="h-64" />
      ) : lista.length === 0 ? (
        <Vazio titulo={busca ? 'Nada encontrado' : 'Nenhuma revisão agendada'}
          descricao={busca ? '' : 'Defina o intervalo de retorno dos serviços e peças no catálogo (ex.: troca de óleo a cada 6 meses).'} />
      ) : (
        grupos.map((g) => (
          <section key={g.titulo}>
            <h2 className={`mb-1.5 text-sm font-semibold ${g.titulo === 'Vencidas' ? 'text-ouro-600' : 'text-slate-700'}`}>
              {g.titulo} ({g.itens.length})
            </h2>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {g.itens.map((r) => {
                const q = quandoVence(r.dias_para);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate text-sm font-semibold text-slate-800">{r.cliente_nome}</p>
                      <p className="truncate text-xs text-slate-500">
                        {r.servico_nome || r.motivo || 'Revisão'}
                        {r.placa && <span className="ml-2 font-mono font-semibold text-slate-600">{r.placa}</span>}
                      </p>
                    </div>
                    <div className="w-32 text-right">
                      <p className="text-sm tabular-nums text-slate-700">{data(r.agendado_para)}</p>
                      <p className={`text-[11px] ${q.alerta ? 'font-semibold text-ouro-600' : 'text-slate-400'}`}>{q.texto}</p>
                    </div>
                    <div className="flex gap-0.5">
                      <button type="button" onClick={() => setEditando(r)} title="Mudar data ou motivo"
                        aria-label={`Editar revisão de ${r.cliente_nome}`}
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => descartar(r)} title="Descartar"
                        aria-label={`Descartar revisão de ${r.cliente_nome}`}
                        className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <NovoRetorno aberto={novo} onFechar={() => setNovo(false)}
        onCriado={() => { setNovo(false); carregar(); }} />
      <EditarRetorno retorno={editando} onFechar={() => setEditando(null)}
        onSalvo={() => { setEditando(null); carregar(); }} />
    </div>
  );
}
