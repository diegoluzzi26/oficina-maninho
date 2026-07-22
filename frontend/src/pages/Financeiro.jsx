import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, PieChart, Pie, Cell,
  BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { api } from '../lib/api';
import { brl, brlCurto, mesCurto, periodoMeses } from '../lib/format';
import { Skeleton, Alerta, Vazio } from '../components/ui';

const AZUL = '#283090';
const OURO = '#D4A843';
const ROSA = '#e11d48';
const VERDE = '#059669';

const PERIODOS = [
  { chave: '3m', texto: '3 meses', meses: 3 },
  { chave: '6m', texto: '6 meses', meses: 6 },
  { chave: '12m', texto: '12 meses', meses: 12 },
];

function Kpi({ titulo, valor, sub, cor = 'text-slate-800', atraso = 0 }) {
  return (
    <div className="card anima p-5" style={{ animationDelay: `${atraso}ms` }}>
      <p className="label">{titulo}</p>
      <p className={`numero mt-2 text-[32px] ${cor}`}>{valor}</p>
      {sub && <p className="mt-2 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function TooltipFin({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-lift">
      <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="tnum text-sm" style={{ color: p.color }}>
          <span className="text-slate-600">{p.name}: </span>
          <span className="font-semibold">{brl(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function Financeiro() {
  const [dados, setDados] = useState(null);
  const [periodo, setPeriodo] = useState('6m');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const meses = PERIODOS.find((p) => p.chave === periodo).meses;

    setCarregando(true);
    setErro('');
    api.painelFinanceiro(periodoMeses(meses))
      .then((d) => !cancelado && setDados(d))
      .catch((e) => !cancelado && setErro(e.message))
      .finally(() => !cancelado && setCarregando(false));

    return () => { cancelado = true; };
  }, [periodo]);

  if (carregando && !dados) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px]" />)}
        </div>
        <Skeleton className="h-[340px]" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[320px]" /><Skeleton className="h-[320px]" />
        </div>
      </div>
    );
  }

  if (erro) return <Alerta tipo="erro">{erro}</Alerta>;
  if (!dados) return null;

  const { resumo, por_categoria: categorias, por_forma: formas,
    por_fornecedor: fornecedores, fluxo_caixa: fluxo } = dados;

  const serieFluxo = fluxo.dados.map((m) => ({
    rotulo: mesCurto(m.mes),
    Receita: m.receita,
    Despesa: m.despesa,
    Lucro: m.lucro,
  }));

  const lucroPositivo = fluxo.totais.lucro >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Análises financeiras</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Despesas por competência · fluxo de caixa por pagamento efetivo
          </p>
        </div>
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
          {PERIODOS.map((p) => (
            <button key={p.chave} onClick={() => setPeriodo(p.chave)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition
                ${periodo === p.chave ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {p.texto}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Receita no período" valor={brl(fluxo.totais.receita)}
          sub="Ordens de serviço pagas" cor="text-emerald-700" atraso={0} />
        <Kpi titulo="Despesas no período" valor={brl(fluxo.totais.despesa)}
          sub={`${resumo.quantidade} lançamentos`} cor="text-rose-600" atraso={60} />
        <Kpi titulo={lucroPositivo ? 'Lucro' : 'Prejuízo'} valor={brl(Math.abs(fluxo.totais.lucro))}
          cor={lucroPositivo ? 'text-maninho-600' : 'text-rose-600'} atraso={120}
          sub={fluxo.totais.margem !== null
            ? `Margem de ${fluxo.totais.margem.toFixed(1).replace('.', ',')}%`
            : 'Sem receita para calcular margem'} />
        <Kpi titulo="A pagar" valor={brl(resumo.total_pendente + resumo.total_atrasado)}
          cor={resumo.total_atrasado > 0 ? 'text-rose-600' : 'text-slate-800'} atraso={180}
          sub={resumo.qtd_atrasadas > 0
            ? `${resumo.qtd_atrasadas} conta(s) atrasada(s)`
            : 'Nenhuma conta atrasada'} />
      </div>

      {/* Fluxo de caixa */}
      <div className="card anima p-5" style={{ animationDelay: '220ms' }}>
        <h2 className="titulo-secao">
          Entrou × Saiu por mês
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          Barras: receita e despesa. Linha: o que sobrou no mês.
        </p>

        {serieFluxo.length === 0 ? (
          <Vazio titulo="Sem movimentação no período" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={serieFluxo} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
              <YAxis tickFormatter={(v) => `R$ ${brlCurto(v)}`}
                tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={78} />
              <Tooltip content={<TooltipFin />} cursor={{ fill: AZUL, fillOpacity: 0.04 }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="Receita" fill={VERDE} fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Despesa" fill={ROSA} fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line type="monotone" dataKey="Lucro" stroke={AZUL} strokeWidth={2.5}
                dot={{ r: 3, fill: '#fff', stroke: AZUL, strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Por categoria */}
        <div className="card anima p-5" style={{ animationDelay: '280ms' }}>
          <h2 className="titulo-secao">
            Despesas por categoria
          </h2>
          <p className="mb-4 text-xs text-slate-500">Onde o dinheiro está indo</p>

          {categorias.length === 0 ? (
            <Vazio titulo="Nenhuma despesa no período" />
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <ResponsiveContainer width="100%" height={220} className="!w-full sm:!w-1/2">
                <PieChart>
                  <Pie data={categorias} dataKey="total" nameKey="categoria"
                    cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={2}>
                    {categorias.map((c) => <Cell key={c.categoria} fill={c.cor} />)}
                  </Pie>
                  <Tooltip content={<TooltipFin />} />
                </PieChart>
              </ResponsiveContainer>

              <ul className="flex-1 space-y-1.5">
                {categorias.map((c) => (
                  <li key={c.categoria} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.cor }} />
                    <span className="flex-1 truncate text-slate-700">{c.categoria}</span>
                    <span className="tnum font-semibold text-slate-800">{brl(c.total)}</span>
                    <span className="tnum w-12 text-right text-xs text-slate-500">
                      {c.percentual.toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Por forma de pagamento */}
        <div className="card anima p-5" style={{ animationDelay: '340ms' }}>
          <h2 className="titulo-secao">
            Por forma de pagamento
          </h2>
          <p className="mb-4 text-xs text-slate-500">Como as contas foram pagas</p>

          {formas.length === 0 ? (
            <Vazio titulo="Nenhuma despesa no período" />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, formas.length * 40)}>
              <BarChart data={formas} layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `R$ ${brlCurto(v)}`}
                  tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="rotulo" width={124}
                  tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                <Tooltip content={<TooltipFin />} cursor={{ fill: AZUL, fillOpacity: 0.05 }} />
                <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {formas.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? OURO : AZUL} fillOpacity={i === 0 ? 1 : 0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Fornecedores */}
      <div className="card anima p-5" style={{ animationDelay: '400ms' }}>
        <h2 className="titulo-secao">
          Maiores fornecedores
        </h2>
        <p className="mb-4 text-xs text-slate-500">Quanto você gastou com cada um no período</p>

        {fornecedores.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Nenhuma despesa vinculada a fornecedor no período.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {fornecedores.map((f, i) => {
              const maior = fornecedores[0].total;
              return (
                <li key={f.fornecedor} className="flex items-center gap-3 py-2.5">
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full
                                    text-[11px] font-bold
                    ${i === 0 ? 'bg-ouro-500 text-maninho-800' : 'bg-maninho-50 text-maninho-600'}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{f.fornecedor}</p>
                    {/* Barra proporcional dá noção de escala sem outro gráfico */}
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-maninho-600/70"
                        style={{ width: `${maior > 0 ? (f.total / maior) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-sm font-bold text-maninho-700">{brl(f.total)}</p>
                    <p className="text-xs text-slate-500">{f.quantidade} compras</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
