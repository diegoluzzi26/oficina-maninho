import { useEffect, useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { api } from '../lib/api';
import { Skeleton, Alerta } from '../components/ui';

// Linhas da comparação. recurso = chave em src/config/planos.js; sem
// recurso, o item faz parte de todos os planos.
const ITENS = [
  { texto: 'Ordens de serviço, orçamentos, clientes e veículos' },
  { texto: 'Agenda e Kanban de etapas' },
  { texto: 'Impressão de OS e checklist' },
  { texto: 'Despesas, fornecedores e financeiro' },
  { texto: 'WhatsApp próprio da oficina', recurso: 'whatsapp' },
  { texto: 'Lembrete de revisão, retornos e follow-up', recurso: 'followup' },
  { texto: 'Despesas recorrentes e DRE', recurso: 'gestao' },
  { texto: 'Funcionários', recurso: 'funcionarios' },
  { texto: 'Recursos de IA e suporte prioritário', recurso: 'ia' },
];

const real = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

/** Plano atual da oficina + tabela comparativa (só leitura; troca é pelo suporte). */
export default function Plano() {
  const [planos, setPlanos] = useState(null);
  const [atual, setAtual] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    Promise.all([api.planos(), api.assinaturaMinha()])
      .then(([p, a]) => { setPlanos(p); setAtual(a); })
      .catch((e) => setErro(e.message));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
          Plano
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          No plano anual você paga 10 mensalidades e usa 12 meses. Para trocar de plano, fale com o suporte.
        </p>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!planos ? (
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {planos.map((p) => {
            const ehAtual = atual?.plano === p.chave;
            return (
              <div key={p.chave}
                className={`card flex flex-col p-5 ${ehAtual ? 'ring-2 ring-maninho-600' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-maninho-800">
                    {p.nome}
                  </h2>
                  {ehAtual && (
                    <span className="rounded bg-maninho-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                      Seu plano
                    </span>
                  )}
                </div>
                <p className="mt-3">
                  <span className="text-3xl font-bold text-slate-800">{real(p.mensal)}</span>
                  <span className="text-sm text-slate-500">/mês</span>
                </p>
                <p className="text-xs text-slate-500">ou {real(p.anual)} no anual</p>
                <p className="mt-3 text-sm font-medium text-slate-700">
                  {p.usuarios === null ? 'Usuários ilimitados' : `Até ${p.usuarios} usuários`}
                </p>
                <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
                  {ITENS.map((it) => {
                    const tem = !it.recurso || p.recursos.includes(it.recurso);
                    return (
                      <li key={it.texto} className={`flex gap-2 ${tem ? 'text-slate-700' : 'text-slate-400'}`}>
                        {tem
                          ? <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                          : <Minus size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
                        <span>{it.texto}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
