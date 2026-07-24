import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, ClipboardList, Users, Receipt, Truck,
  TrendingUp, Wallet, HardHat, RefreshCw, PhoneCall, Wrench, Settings,
  Menu, X,
} from 'lucide-react';
import { api, getUser, clearSession } from '../lib/api';
import { Marca, MarcaCompacta } from './Marca';

const MENU = [
  { para: '/', texto: 'Painel', exato: true, Icone: LayoutDashboard },
  { para: '/agenda', texto: 'Agenda', Icone: Calendar },
  { para: '/ordens', texto: 'Ordens', Icone: ClipboardList },
  { para: '/clientes', texto: 'Clientes', Icone: Users },
  { para: '/despesas', texto: 'Despesas', badge: true, Icone: Receipt },
  { para: '/fornecedores', texto: 'Fornecedores', Icone: Truck },
  { para: '/financeiro', texto: 'Financeiro', Icone: TrendingUp },
  { para: '/pessoal', texto: 'Pessoal', somenteAdmin: true, Icone: Wallet },
  { para: '/funcionarios', texto: 'Funcionários', somenteAdmin: true, Icone: HardHat },
  { para: '/recorrentes', texto: 'Recorrentes', somenteAdmin: true, Icone: RefreshCw },
  { para: '/retornos', texto: 'Retornos', Icone: PhoneCall },
  { para: '/servicos', texto: 'Catálogo', Icone: Wrench },
  { para: '/configuracoes', texto: 'Config', somenteAdmin: true, Icone: Settings },
];

export default function Layout() {
  const usuario = getUser();
  const navigate = useNavigate();
  const local = useLocation();
  const [alertas, setAlertas] = useState(null);
  const [abertoMobile, setAbertoMobile] = useState(false);

  // Recarrega ao trocar de tela: o contador não pode ficar velho
  // depois que o usuário dá baixa num boleto.
  useEffect(() => {
    let cancelado = false;
    api.alertas(7).then((a) => !cancelado && setAlertas(a)).catch(() => {});
    setAbertoMobile(false); // fecha o drawer ao navegar
    return () => { cancelado = true; };
  }, [local.pathname]);

  const pendencias = (alertas?.atrasadas.length || 0) + (alertas?.vence_hoje.length || 0);
  const itens = MENU.filter((m) => !m.somenteAdmin || usuario?.role === 'admin');

  function sair() {
    clearSession();
    navigate('/login', { replace: true });
  }

  // Bloco de links reutilizado no sidebar desktop e no drawer mobile
  const Links = () => (
    <nav className="flex flex-1 flex-col gap-0.5">
      {itens.map(({ para, texto, exato, badge, Icone }) => (
        <NavLink key={para} to={para} end={exato}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-md px-3 py-2 font-display text-[13px]
             font-medium uppercase tracking-[.06em] transition
             ${isActive
               ? 'bg-maninho-600 text-white shadow-sm'
               : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
          <Icone size={18} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          <span className="flex-1 truncate">{texto}</span>
          {badge && pendencias > 0 && (
            <span className="pulso inline-flex h-[17px] min-w-[17px] items-center justify-center
                             rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {pendencias}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* ---------- Sidebar desktop (fixa à esquerda) ---------- */}
      <aside className="hidden lg:flex sticky top-0 h-screen w-[220px] shrink-0
                        flex-col bg-painel-900 shadow-painel">
        <div className="border-b border-white/10 px-5 pb-4 pt-5">
          <Marca variante="claro" tamanho="sm" />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-3">
          <Links />
        </div>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3">
            <p className="truncate text-sm font-semibold text-white">{usuario?.nome}</p>
            <p className="font-display text-[10px] uppercase tracking-[.14em] text-white/45">
              {usuario?.role}
            </p>
          </div>
          <button onClick={sair}
            className="w-full rounded border border-white/20 px-3 py-1.5 font-display text-[11px]
                       font-medium uppercase tracking-[.1em] text-white/80
                       transition hover:border-white/40 hover:bg-white/5 hover:text-white">
            Sair
          </button>
        </div>
      </aside>

      {/* ---------- Coluna direita: topbar mobile + conteúdo ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar só em telas < lg (sidebar sumiu, precisa do botão menu) */}
        <header className="sticky top-0 z-30 flex h-[58px] items-center gap-3
                            border-b border-white/10 bg-painel-900 px-4 shadow-painel lg:hidden">
          <button onClick={() => setAbertoMobile(true)}
            className="rounded p-1.5 text-white hover:bg-white/10" aria-label="Abrir menu">
            <Menu size={22} />
          </button>
          <MarcaCompacta />
          <div className="ml-auto flex items-center gap-2">
            {pendencias > 0 && (
              <span className="pulso rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {pendencias}
              </span>
            )}
            <button onClick={sair}
              className="rounded border border-white/20 px-2.5 py-1 font-display text-[10px]
                         font-medium uppercase tracking-[.1em] text-white/80 hover:bg-white/5">
              Sair
            </button>
          </div>
        </header>

        {/* Drawer mobile: overlay + sidebar deslizando */}
        {abertoMobile && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setAbertoMobile(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col bg-painel-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 pb-4 pt-5">
                <Marca variante="claro" tamanho="sm" />
                <button onClick={() => setAbertoMobile(false)}
                  className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                  aria-label="Fechar menu">
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-1 flex-col overflow-y-auto p-3">
                <Links />
              </div>
              <div className="border-t border-white/10 p-4">
                <p className="mb-2 truncate text-sm font-semibold text-white">{usuario?.nome}</p>
                <button onClick={sair}
                  className="w-full rounded border border-white/20 px-3 py-1.5 font-display text-[11px]
                             font-medium uppercase tracking-[.1em] text-white/80 hover:bg-white/5">
                  Sair
                </button>
              </div>
            </aside>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>

        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-6 sm:px-8">
          <p className="border-t border-slate-200 pt-4 text-center font-display text-[10.5px]
                        uppercase tracking-[.2em] text-slate-500">
            Auto Elétrica Maninho · RS-020, 1055 · Gravataí/RS
          </p>
        </footer>
      </div>
    </div>
  );
}
