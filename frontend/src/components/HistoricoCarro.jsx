import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { brl, data, agruparPorSinonimo } from '../lib/format';
import { Skeleton, Alerta, Vazio, Badge } from './ui';

/**
 * Histórico completo de um veículo — usado no detalhe do carro
 * (Clientes.jsx) E dentro do detalhe da OS pra atendente ver o que
 * já foi feito antes sem sair da tela.
 *
 * `carroId` obrigatório. `excluirOsId` opcional: quando aparecemos
 * dentro do DetalheOS, faz sentido esconder a própria OS do bloco
 * "ordens anteriores" pra não repetir informação.
 */
export function HistoricoCarro({ carroId, excluirOsId, compacto = false }) {
  const [hist, setHist] = useState(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState('servicos'); // 'servicos' | 'pecas' | 'ordens'

  useEffect(() => {
    if (!carroId) return;
    setHist(null); setErro('');
    api.historicoCarro(carroId).then(setHist).catch((e) => setErro(e.message));
  }, [carroId]);

  if (erro) return <Alerta tipo="erro">{erro}</Alerta>;
  if (!hist) return <Skeleton className="h-40" />;

  const ordens = hist.ordens.filter((o) => o.id !== excluirOsId);
  const servicosAgrupados = agruparPorSinonimo(hist.servicos_realizados, 'nome_servico');
  const pecasAgrupadas = agruparPorSinonimo(hist.pecas_trocadas, 'descricao');
  const totalServicos = servicosAgrupados.length;
  const totalPecas = pecasAgrupadas.length;

  return (
    <div className="space-y-3">
      {/* Resumo */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="label mb-0.5">Total de ordens</p>
          <p className="tnum text-lg font-bold text-slate-800">{hist.resumo.qtd_os}</p>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="label mb-0.5">Ordens pagas</p>
          <p className="tnum text-lg font-bold text-emerald-700">{hist.resumo.qtd_pagas}</p>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="label mb-0.5">Total gasto</p>
          <p className="tnum text-lg font-bold text-maninho-700">{brl(hist.resumo.total_gasto)}</p>
        </div>
        <div className="rounded-md bg-slate-50 px-3 py-2">
          <p className="label mb-0.5">Última visita</p>
          <p className="text-sm font-semibold text-slate-700">
            {hist.resumo.ultima_visita ? data(hist.resumo.ultima_visita) : '—'}
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
        {[
          ['servicos', 'Serviços', totalServicos],
          ['pecas', 'Peças', totalPecas],
          ['ordens', 'Ordens', ordens.length],
        ].map(([k, t, qtd]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`flex-1 rounded px-2.5 py-1 text-xs font-semibold transition
              ${aba === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t} <span className={aba === k ? 'text-white/80' : 'text-slate-400'}>({qtd})</span>
          </button>
        ))}
      </div>

      {/* Lista da aba selecionada */}
      {aba === 'servicos' && (
        totalServicos === 0
          ? <Vazio titulo="Nenhum serviço registrado neste veículo"
              descricao="Serviços lançados nas OS aparecem aqui." />
          : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {servicosAgrupados.slice(0, compacto ? 5 : 100).map((g) => (
                <li key={g.chave} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{g.nome_exibicao}</p>
                    <p className="text-[11px] text-slate-500">
                      {g.ocorrencias > 1
                        ? `${g.ocorrencias}× · última em OS nº ${g.ultima_numero_os} (${data(g.ultima_em)})`
                        : `OS nº ${g.ultima_numero_os} · ${data(g.ultima_em)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-sm font-semibold">{brl(g.valor_total)}</p>
                    {g.quantidade > 1 && (
                      <p className="text-[10px] text-slate-500">{g.quantidade} unid.</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
      )}

      {aba === 'pecas' && (
        totalPecas === 0
          ? <Vazio titulo="Nenhuma peça trocada neste veículo"
              descricao="Peças lançadas nas OS aparecem aqui." />
          : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {pecasAgrupadas.slice(0, compacto ? 5 : 100).map((g) => (
                <li key={g.chave} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{g.nome_exibicao}</p>
                    <p className="text-[11px] text-slate-500">
                      {g.ocorrencias > 1
                        ? `${g.ocorrencias}× · última em OS nº ${g.ultima_numero_os} (${data(g.ultima_em)})`
                        : `OS nº ${g.ultima_numero_os} · ${data(g.ultima_em)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tnum text-sm font-semibold">{brl(g.valor_total)}</p>
                    <p className="text-[10px] text-slate-500">{g.quantidade} unid.</p>
                  </div>
                </li>
              ))}
            </ul>
          )
      )}

      {aba === 'ordens' && (
        ordens.length === 0
          ? <Vazio titulo="Nenhuma outra ordem neste veículo" />
          : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {ordens.slice(0, compacto ? 5 : 50).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="tnum font-semibold text-maninho-600">#{o.numero_os}</span>
                  <Badge status={o.status} />
                  <span className="text-xs text-slate-500">{data(o.aberta_em)}</span>
                  <span className="tnum ml-auto text-sm font-semibold">{brl(o.valor_total)}</span>
                </li>
              ))}
            </ul>
          )
      )}
    </div>
  );
}
