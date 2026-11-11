import { useEffect, useState } from 'react';
import { Wrench, Star, RotateCcw, Megaphone, ClipboardCheck, UserX, Cake, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { brl, mesCurto } from '../../lib/format';
import { Skeleton, Alerta, Vazio } from '../../components/ui';

/**
 * O que o follow-up trouxe de volta. Conta só o que foi ENVIADO no
 * período. "Voltaram" = o cliente abriu OS até 30 dias depois do contato;
 * faturamento = o que essas OS renderam depois de pagas.
 */

// Ícone pela chave do cartão fixo ou pelo gatilho da automação própria.
const ICONES = {
  revisao: Wrench, pos_servico: Star, reativacao: RotateCcw, campanha: Megaphone,
  servico_feito: ClipboardCheck, sumido: UserX, aniversario: Cake,
};

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function Numero({ valor, rotulo, detalhe }) {
  return (
    <div className="border-t-2 border-slate-800 pt-2">
      <p className="font-display text-[34px] font-semibold leading-none tabular-nums text-slate-800">{valor}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{rotulo}</p>
      {detalhe && <p className="text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

export default function Resultados() {
  const [meses, setMeses] = useState(6);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setDados(null);
    api.followupResultados(meses).then(setDados).catch((e) => setErro(e.message));
  }, [meses]);

  const t = dados?.total;
  const maxMes = Math.max(1, ...(dados?.por_mes || []).map((m) => m.enviados));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-sm text-slate-500">
          Conta as mensagens enviadas no período. Voltou = o cliente abriu OS até 30 dias depois do contato.
        </p>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Período">
          {[3, 6, 12].map((m) => (
            <button key={m} type="button" onClick={() => setMeses(m)} aria-pressed={meses === m}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500
                ${meses === m ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {m} meses
            </button>
          ))}
        </div>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!dados ? (
        <Skeleton className="h-64" />
      ) : t.enviados === 0 ? (
        <Vazio titulo="Nenhuma mensagem enviada no período"
          descricao="Quando os follow-ups forem enviados, aqui aparece quantos responderam, quantos voltaram e quanto faturou." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <Numero valor={t.enviados} rotulo="Mensagens enviadas" />
            <Numero valor={t.responderam} rotulo="Responderam" detalhe={`${pct(t.responderam, t.enviados)}% das enviadas`} />
            <Numero valor={t.voltaram} rotulo="Voltaram à oficina" detalhe={`${pct(t.voltaram, t.enviados)}% das enviadas`} />
            <Numero valor={brl(t.faturamento)} rotulo="Faturado com quem voltou" detalhe="OS pagas" />
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Por automação</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Automação</th>
                    <th className="px-4 py-2 text-right font-semibold">Enviadas</th>
                    <th className="px-4 py-2 text-right font-semibold">Responderam</th>
                    <th className="px-4 py-2 text-right font-semibold">Voltaram</th>
                    <th className="px-4 py-2 text-right font-semibold">Faturado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(dados.por_automacao || []).map((r) => {
                    const Icone = ICONES[r.chave || r.gatilho] || Send;
                    const nome = r.nome;
                    return (
                      <tr key={r.regra_id || 'manual'}>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                            <Icone className="h-4 w-4 text-slate-400" aria-hidden="true" /> {nome}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.enviados}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {r.responderam} <span className="text-xs text-slate-400">({pct(r.responderam, r.enviados)}%)</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {r.voltaram} <span className="text-xs text-slate-400">({pct(r.voltaram, r.enviados)}%)</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{brl(r.faturamento)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Mês a mês</h2>
            <ul className="space-y-2">
              {dados.por_mes.map((m) => (
                <li key={m.mes} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="text-slate-500">{mesCurto(`${m.mes}-01`)}</span>
                  <div className="relative h-6 overflow-hidden rounded bg-slate-100"
                    title={`${m.enviados} enviadas, ${m.voltaram} voltaram`}>
                    <div className="absolute inset-y-0 left-0 bg-maninho-200" style={{ width: `${(m.enviados / maxMes) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-maninho-600" style={{ width: `${(m.voltaram / maxMes) * 100}%` }} />
                  </div>
                  <span className="w-28 text-right tabular-nums leading-tight text-slate-600">
                    <span className="block">{m.voltaram} de {m.enviados} voltaram</span>
                    <span className="block text-xs text-slate-400">{brl(m.faturamento)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-maninho-200" /> enviadas</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-maninho-600" /> voltaram</span>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
