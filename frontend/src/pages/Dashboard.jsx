import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie,
} from 'recharts';
import { api } from '../lib/api';
import { brl, brlCurto, nomeMes, telefone, rotuloForma } from '../lib/format';
import { Skeleton, Alerta, Vazio } from '../components/ui';

const AZUL = '#283090';
const OURO = '#D4A843';
const VERDE = '#059669';
const VERMELHO = '#DC2626';

const CORES_FORMA = ['#283090', '#D4A843', '#059669', '#0EA5E9', '#EC4899', '#F97316', '#7C3AED', '#64748B'];

function Kpi({ titulo, valor, sub, tomValor = 'normal', atraso = 0 }) {
  const cor = {
    normal: 'text-slate-800',
    marca: 'text-maninho-600',
    verde: 'text-emerald-600',
    vermelho: 'text-rose-600',
  }[tomValor];
  return (
    <div className="card anima p-5" style={{ animationDelay: `${atraso}ms` }}>
      <p className="label">{titulo}</p>
      <p className={`numero mt-2 text-[30px] ${cor}`}>{valor}</p>
      {sub && <p className="mt-2 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function TooltipMoeda({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-lift">
      {label && <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey || p.name} className="tnum text-sm font-semibold text-maninho-700">
          {p.name && `${p.name}: `}{brl(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const hoje = new Date();
  const [ref, setRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });
  const [painel, setPainel] = useState(null);
  const [retornos, setRetornos] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true); setErro('');

    Promise.all([api.painelMes(ref), api.retornosDoMes(ref)])
      .then(([p, r]) => {
        if (cancelado) return;
        setPainel(p); setRetornos(r);
      })
      .catch((e) => !cancelado && setErro(e.message))
      .finally(() => !cancelado && setCarregando(false));

    return () => { cancelado = true; };
  }, [ref.ano, ref.mes]);

  function mudarMes(delta) {
    setRef((r) => {
      let m = r.mes + delta;
      let a = r.ano;
      if (m > 12) { m = 1; a += 1; }
      if (m < 1)  { m = 12; a -= 1; }
      return { ano: a, mes: m };
    });
  }

  const eMesAtual = ref.ano === hoje.getFullYear() && ref.mes === hoje.getMonth() + 1;

  if (carregando && !painel) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[68px]" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0,1,2,3].map((i) => <Skeleton key={i} className="h-[116px]" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[300px]" /><Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }
  if (erro) return <Alerta tipo="erro">{erro}</Alerta>;
  if (!painel) return null;

  const emAberto = painel.em_aberto.reduce((s, x) => s + x.qtd, 0);
  const valorEmAberto = painel.em_aberto.reduce((s, x) => s + x.valor, 0);
  const variacao = painel.comparativo.variacao_percentual;

  return (
    <div className="space-y-6">
      {/* Cabeçalho + seletor de mês */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Painel {eMesAtual && '— mês atual'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Receita, despesa e retornos programados de {nomeMes(painel.referencia.mes)} de {painel.referencia.ano}.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white p-1 shadow-sm">
          <button onClick={() => mudarMes(-1)}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100">◀</button>
          <span className="tnum px-3 text-sm font-semibold text-slate-800">
            {nomeMes(painel.referencia.mes)}/{painel.referencia.ano}
          </span>
          <button onClick={() => mudarMes(1)}
            disabled={eMesAtual}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300">▶</button>
          {!eMesAtual && (
            <button onClick={() => setRef({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })}
              className="ml-1 rounded bg-maninho-50 px-2 py-1 text-xs font-semibold text-maninho-700 hover:bg-maninho-100">
              Voltar ao mês atual
            </button>
          )}
        </div>
      </div>

      {/* Meta mensal — só aparece se configurada */}
      {painel.meta && painel.meta > 0 && (() => {
        const pct = Math.min(100, (painel.receita / painel.meta) * 100);
        const pctReal = (painel.receita / painel.meta) * 100;
        const atingiu = painel.receita >= painel.meta;
        return (
          <div className="card anima p-5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="titulo-secao">Meta do mês</h2>
                <p className="text-xs text-slate-500">
                  {atingiu
                    ? `🎯 Meta batida! ${(pctReal - 100).toFixed(1).replace('.', ',')}% acima.`
                    : painel.dias_restantes > 0
                      ? `Faltam ${brl(painel.meta - painel.receita)} em ${painel.dias_restantes} ${painel.dias_restantes === 1 ? 'dia' : 'dias'}`
                      : `Fechou em ${brl(painel.receita)} — ${brl(painel.meta - painel.receita)} abaixo da meta.`}
                </p>
              </div>
              <div className="text-right">
                <p className="tnum font-display text-2xl font-bold text-maninho-700">
                  {brl(painel.receita)} <span className="text-sm font-normal text-slate-500">de {brl(painel.meta)}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {pctReal.toFixed(1).replace('.', ',')}%
                  {painel.projecao_fechamento && painel.dias_restantes > 0 && (
                    <> · projeção fecha em <b>{brl(painel.projecao_fechamento)}</b></>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${atingiu ? 'bg-emerald-500' : 'bg-maninho-600'}`}
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })()}

      {/* KPIs do mês */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Receita" valor={brl(painel.receita)}
          tomValor="marca"
          sub={`${painel.qtd_os} ${painel.qtd_os === 1 ? 'ordem paga' : 'ordens pagas'}`}
          atraso={0} />
        <Kpi titulo="Despesa paga" valor={brl(painel.despesa)}
          tomValor="vermelho"
          sub="Contas quitadas neste mês" atraso={60} />
        <Kpi titulo="Lucro" valor={brl(painel.lucro)}
          tomValor={painel.lucro >= 0 ? 'verde' : 'vermelho'}
          sub={painel.lucro >= 0 ? 'Receita − despesa' : 'No vermelho'}
          atraso={120} />
        <Kpi titulo="Na oficina agora" valor={String(emAberto)}
          sub={emAberto ? `${brl(valorEmAberto)} a receber` : 'Nada em aberto'}
          atraso={180} />
      </div>

      {/* Ticket + comparativo + variação */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi titulo="Ticket médio" valor={brl(painel.ticket_medio)}
          sub={`${painel.clientes_atendidos} clientes atendidos`} atraso={240} />
        <Kpi titulo="Mês anterior" valor={brl(painel.comparativo.mes_anterior)}
          sub={`${painel.comparativo.qtd_anterior} OS pagas`} atraso={280} />
        <Kpi titulo="Variação vs anterior"
          tomValor={variacao === null ? 'normal' : variacao >= 0 ? 'verde' : 'vermelho'}
          valor={variacao === null ? '—' :
            `${variacao >= 0 ? '▲' : '▼'} ${Math.abs(variacao).toFixed(1).replace('.', ',')}%`}
          sub={variacao === null ? 'Sem base de comparação' :
            variacao >= 0 ? 'Melhor que o mês anterior' : 'Pior que o mês anterior'}
          atraso={320} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Clientes para chamar */}
        <div className="card anima p-5" style={{ animationDelay: '360ms' }}>
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="titulo-secao">Clientes para chamar este mês</h2>
              <p className="text-xs text-slate-500">
                Retornos agendados a partir de serviços com intervalo configurado no catálogo.
              </p>
            </div>
            <Link to="/retornos" className="text-xs font-semibold text-maninho-600 hover:underline">
              Ver todos
            </Link>
          </div>
          {retornos.length === 0 ? (
            <Vazio titulo="Nenhum retorno programado"
              descricao="Configure o intervalo de retorno em serviços do catálogo (ex: troca de óleo → 6 meses) para começar a ver clientes aqui." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {retornos.slice(0, 6).map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{r.cliente_nome}</p>
                    <p className="text-xs text-slate-500">
                      {r.servico_nome} · {telefone(r.cliente_telefone)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-xs font-semibold text-maninho-700">
                      {new Date(r.agendado_para).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {r.dias_para < 0 ? `${-r.dias_para}d atrasado`
                        : r.dias_para === 0 ? 'hoje'
                        : `em ${r.dias_para}d`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recebimento por forma */}
        <div className="card anima p-5" style={{ animationDelay: '420ms' }}>
          <h2 className="titulo-secao">Recebimento por forma</h2>
          <p className="mb-4 text-xs text-slate-500">Total recebido em {nomeMes(painel.referencia.mes)}</p>

          {painel.por_forma.length === 0 ? (
            <Vazio titulo="Nenhum recebimento neste mês" />
          ) : (
            <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={painel.por_forma} dataKey="total" nameKey="forma"
                    innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {painel.por_forma.map((_, i) => (
                      <Cell key={i} fill={CORES_FORMA[i % CORES_FORMA.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<TooltipMoeda />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="space-y-1.5">
                {painel.por_forma.map((f, i) => (
                  <li key={f.forma} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-sm"
                      style={{ background: CORES_FORMA[i % CORES_FORMA.length] }} />
                    <span className="flex-1 text-slate-700">{rotuloForma(f.forma)}</span>
                    <span className="tnum font-semibold text-slate-800">{brl(f.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Top serviços do mês */}
      <div className="card anima p-5" style={{ animationDelay: '480ms' }}>
        <h2 className="titulo-secao">Serviços que mais renderam</h2>
        <p className="mb-4 text-xs text-slate-500">Top 5 no mês por receita</p>

        {painel.top_servicos.length === 0 ? (
          <Vazio titulo="Nenhum serviço faturado" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, painel.top_servicos.length * 40)}>
            <BarChart data={painel.top_servicos} layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tickFormatter={brlCurto}
                tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="nome_servico" width={200}
                tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <Tooltip content={<TooltipMoeda />} cursor={{ fill: '#2B3D8F', fillOpacity: 0.05 }} />
              <Bar dataKey="receita" radius={[0, 4, 4, 0]} maxBarSize={24}>
                {painel.top_servicos.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? OURO : AZUL} fillOpacity={i === 0 ? 1 : 0.82} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
