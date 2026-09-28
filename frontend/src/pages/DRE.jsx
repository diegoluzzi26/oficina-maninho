import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { brl, periodoMeses } from '../lib/format';
import { Skeleton, Alerta } from '../components/ui';

// Mesmos presets de período do Financeiro, pra experiência consistente.
const PERIODOS = [
  { chave: 'atual', texto: 'Mês atual', meses: 1 },
  { chave: '3m',    texto: '3 meses',   meses: 3 },
  { chave: '6m',    texto: '6 meses',   meses: 6 },
  { chave: '12m',   texto: '12 meses',  meses: 12 },
];

// Uma linha do DRE. `tipo` controla o estilo:
//   subtotal = negrito com borda em cima; item = linha comum;
//   detalhe = categoria indentada; resultado = destaque final.
function Linha({ rotulo, valor, tipo = 'item', negativo = false, cor }) {
  const base = 'flex items-center justify-between py-2 px-3 text-sm';
  const estilo = {
    subtotal: 'font-semibold border-t border-slate-300 dark:border-slate-600',
    item: 'text-slate-700 dark:text-slate-300',
    detalhe: 'text-slate-500 dark:text-slate-400 pl-7 text-[13px]',
    resultado: 'font-bold text-base border-t-2 border-slate-400 dark:border-slate-500 mt-1',
  }[tipo];
  return (
    <div className={`${base} ${estilo}`}>
      <span className="flex items-center gap-2">
        {cor && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: cor }} />}
        {rotulo}
      </span>
      <span className="tabular-nums">{negativo && valor > 0 ? `(${brl(valor)})` : brl(valor)}</span>
    </div>
  );
}

export default function DRE() {
  const [preset, setPreset] = useState('atual');
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let cancelado = false;
    const meses = PERIODOS.find((p) => p.chave === preset)?.meses ?? 1;
    setCarregando(true);
    setErro(null);
    api.dre(periodoMeses(meses))
      .then((d) => { if (!cancelado) setDados(d); })
      .catch((e) => { if (!cancelado) setErro(e.message); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [preset]);

  const lucro = (dados?.resultado_liquido ?? 0) >= 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">DRE</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Demonstração do Resultado — regime de caixa
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          {PERIODOS.map((p) => (
            <button
              key={p.chave}
              onClick={() => setPreset(p.chave)}
              className={`px-3 py-1.5 text-sm ${preset === p.chave
                ? 'bg-maninho-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
            >
              {p.texto}
            </button>
          ))}
        </div>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {carregando && <Skeleton className="h-96" />}

      {!carregando && !erro && dados && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700/50">
          <Linha rotulo="Receita bruta" valor={dados.receita_bruta} tipo="item" />
          <Linha rotulo="(–) Descontos concedidos" valor={dados.descontos} negativo tipo="item" />
          <Linha rotulo="(–) Impostos e taxas" valor={dados.deducoes} negativo tipo="item" />
          <Linha rotulo="Receita líquida" valor={dados.receita_liquida} tipo="subtotal" />

          <Linha rotulo="(–) CMV — peças e materiais" valor={dados.cmv} negativo tipo="item" />
          <Linha rotulo="Lucro bruto" valor={dados.lucro_bruto} tipo="subtotal" />

          <Linha rotulo="(–) Despesas operacionais" valor={dados.total_operacional} negativo tipo="item" />
          {dados.despesas_operacionais.map((d) => (
            <Linha key={d.categoria} rotulo={d.categoria} valor={d.total} negativo tipo="detalhe" cor={d.cor} />
          ))}

          <div className={`flex items-center justify-between py-3 px-3 ${lucro
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-rose-700 dark:text-rose-400'} font-bold text-base border-t-2 border-slate-400 dark:border-slate-500`}
          >
            <span>{lucro ? 'Lucro líquido' : 'Prejuízo líquido'}</span>
            <span className="tabular-nums">{brl(dados.resultado_liquido)}</span>
          </div>
          <div className="flex items-center justify-between py-2 px-3 text-xs text-slate-500 dark:text-slate-400">
            <span>Margem sobre a receita bruta</span>
            <span className="tabular-nums">{dados.margem}%</span>
          </div>
        </div>
      )}

      {!carregando && !erro && dados && (
        <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
          {dados.qtd_os} OS pagas no período. Receita pelo que entrou no caixa;
          despesas pelo que foi efetivamente pago.
        </p>
      )}
    </div>
  );
}
