import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { api, getUser, clearSession } from '../lib/api';
import { MarcaCompacta } from './Marca';

const MENU = [
  { para: '/', texto: 'Painel', exato: true },
  { para: '/agenda', texto: 'Agenda' },
  { para: '/ordens', texto: 'Ordens' },
  { para: '/clientes', texto: 'Clientes' },
  { para: '/despesas', texto: 'Despesas', badge: true },
  { para: '/fornecedores', texto: 'Fornecedores' },
  { para: '/financeiro', texto: 'Financeiro' },
  { para: '/retornos', texto: 'Retornos' },
  { para: '/servicos', texto: 'Catálogo' },
  { para: '/configuracoes', texto: 'Config', somenteAdmin: true },
];

export default function Layout() {
  const usuario = getUser();
  const navigate = useNavigate();
  const local = useLocation();
  const [alertas, setAlertas] = useState(null);

  // Recarrega ao trocar de tela: o contador não pode ficar velho
  // depois que o usuário dá baixa num boleto.
  useEffect(() => {
    let cancelado = false;
    api.alertas(7).then((a) => !cancelado && setAlertas(a)).catch(() => {});
    return () => { cancelado = true; };
  }, [local.pathname]);

  const pendencias = (alertas?.atrasadas.length || 0) + (alertas?.vence_hoje.length || 0);

  function sair() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen">
      {/* Painel escuro da fachada, com o filete dourado do letreiro */}
      <header className="sticky top-0 z-40 bg-painel-900 shadow-painel">
        <div className="mx-auto flex h-[58px] max-w-[1500px] items-center gap-6 px-4 sm:px-6">
          <MarcaCompacta />

          <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
            {MENU.filter((m) => !m.somenteAdmin || usuario?.role === 'admin').map((m) => (
              <NavLink key={m.para} to={m.para} end={m.exato}
                className={({ isActive }) =>
                  `relative whitespace-nowrap px-3 py-4 font-display text-[13px] font-medium
                   uppercase tracking-[.06em] transition
                   ${isActive
                    ? 'text-white after:absolute after:inset-x-2 after:bottom-2.5 after:h-[2px] after:rounded-full after:bg-ouro-500'
                    : 'text-white/70 hover:text-white'}`}>
                {m.texto}
                {m.badge && pendencias > 0 && (
                  <span className="pulso ml-1.5 inline-flex h-[17px] min-w-[17px] items-center
                                   justify-center rounded-full bg-rose-500 px-1
                                   text-[10px] font-bold text-white">
                    {pendencias}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold leading-tight text-white">{usuario?.nome}</p>
              <p className="font-display text-[10px] uppercase tracking-[.14em] text-white/45">
                {usuario?.role}
              </p>
            </div>
            <button onClick={sair}
              className="rounded border border-white/20 px-3 py-1.5 font-display text-[11px]
                         font-medium uppercase tracking-[.1em] text-white/80
                         transition hover:border-white/40 hover:bg-white/5 hover:text-white">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-[1500px] px-4 pb-7 sm:px-6">
        <p className="border-t border-slate-200 pt-4 text-center font-display text-[10.5px]
                      uppercase tracking-[.2em] text-slate-600">
          Auto Elétrica Maninho · RS-020, 1055 · Gravataí/RS
        </p>
      </footer>
    </div>
  );
}
