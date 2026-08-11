import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { api, getUser } from '../lib/api';
import { brl, brlCurto, nomeMes } from '../lib/format';
import { Modal, Skeleton } from './ui';

const AZUL = '#283090';
const OURO = '#D4A843';
const VERDE = '#059669';
const CINZA = '#94a3b8';

/**
 * "Bom dia!" modal — mostra automaticamente no primeiro acesso do dia
 * (por usuário, dedup via localStorage). Puxa painel-mes + comparativo
 * pra dar uma visão rápida de como a empresa tá indo.
 */
function chaveDia() {
  const u = getUser();
  const hoje = new Date().toISOString().slice(0, 10);
  return `resumo_visto_${u?.email || u?.id || 'anon'}_${hoje}`;
}

function jaViuHoje() {
  try { return !!localStorage.getItem(chaveDia()); } catch { return false; }
}

function marcarComoVisto() {
  try { localStorage.setItem(chaveDia(), '1'); } catch { /* ignore */ }
}

export default function ResumoDiario() {
  const [aberto, setAberto] = useState(false);
  const [painel, setPainel] = useState(null);
  const usuario = getUser();

  useEffect(() => {
    // Papel 'basico' (mecânico/operador) não vê dados financeiros
    if (usuario?.role === 'basico') return;
    if (jaViuHoje()) return;
    const hoje = new Date();
    api.painelMes({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })
      .then((p) => {
        setPainel(p);
        setAberto(true);
        marcarComoVisto();
      })
      .catch(() => { /* silencioso — não bloqueia login se falhar */ });
  }, [usuario?.role]);

  if (!aberto) return null;

  const primeiroNome = (usuario?.nome || '').split(' ')[0] || 'oi';
  const saudacao = (() => {
    const h = new Date().getHours();
    if (h < 12) return `Bom dia, ${primeiroNome}!`;
    if (h < 18) return `Boa tarde, ${primeiroNome}!`;
    return `Boa noite, ${primeiroNome}!`;
  })();

  return (
    <Modal aberto titulo={saudacao} largura="max-w-3xl" onFechar={() => setAberto(false)}>
      {!painel ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-slate-500">
            Aqui vai um resumo rápido de <b>{nomeMes(painel.referencia.mes)} de {painel.referencia.ano}</b> —
            como a oficina tá indo até agora.
          </p>

          {/* Cards de números principais */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Receita', brlCurto(painel.receita), AZUL],
              ['Despesas', brlCurto(painel.despesa), CINZA],
              ['Lucro', brlCurto(painel.lucro), painel.lucro >= 0 ? VERDE : '#DC2626'],
              ['OSs pagas', painel.qtd_os, OURO],
            ].map(([label, valor, cor]) => (
              <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center">
                <p className="tnum font-display text-xl font-bold" style={{ color: cor }}>{valor}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Meta */}
          {painel.meta > 0 && (() => {
            const pct = Math.min(100, (painel.receita / painel.meta) * 100);
            const atingiu = painel.receita >= painel.meta;
            return (
              <div className="rounded-md border border-slate-200 p-3">
                <div className="mb-1 flex items-baseline justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Meta do mês: {brl(painel.meta)}
                  </p>
                  <span className={`text-xs font-semibold ${atingiu ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {atingiu ? '🎯 Batida!' : `${pct.toFixed(1)}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: atingiu ? VERDE : AZUL }} />
                </div>
              </div>
            );
          })()}

          {/* Top serviços — barra */}
          {painel.top_servicos?.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Top serviços do mês
              </h3>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer>
                  <BarChart data={painel.top_servicos} layout="vertical"
                    margin={{ top: 4, right: 12, bottom: 4, left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tickFormatter={brlCurto}
                      tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="nome_servico"
                      width={130} tick={{ fontSize: 11, fill: '#334155' }} />
                    <Tooltip formatter={(v) => brl(v)} />
                    <Bar dataKey="receita" fill={AZUL} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Por forma de pagamento — pizza */}
          {painel.por_forma?.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Como o cliente pagou
              </h3>
              <div style={{ width: '100%', height: 160 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={painel.por_forma} dataKey="total" nameKey="forma"
                      cx="50%" cy="50%" outerRadius={60} label={(e) => e.forma}>
                      {painel.por_forma.map((_, i) => (
                        <Cell key={i} fill={[AZUL, OURO, VERDE, CINZA, '#DC2626'][i % 5]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => brl(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-slate-200 pt-4">
            <button onClick={() => setAberto(false)} className="btn-primary">
              Bora começar! →
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
