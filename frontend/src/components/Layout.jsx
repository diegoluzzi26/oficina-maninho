import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, ClipboardList, Users, Receipt, Truck,
  TrendingUp, Wallet, HardHat, RefreshCw, PhoneCall, MessageCircle,
  Wrench, Settings, Menu, X, FileText, Building2,
} from 'lucide-react';
import { api, getUser, clearSession } from '../lib/api';
import { Marca, MarcaCompacta } from './Marca';
import ResumoDiario from './ResumoDiario';
import { useTema, ToggleTema } from '../lib/tema';
import { VERSAO_ROTULO, VERSAO_DETALHE } from '../lib/versao';

// paraBasico = itens que o papel 'basico' também vê. Sem esse flag,
// só admin/atendente enxergam. somenteAdmin restringe ainda mais.
const MENU = [
  { para: '/', texto: 'Painel', exato: true, Icone: LayoutDashboard },
  { para: '/agenda', texto: 'Agenda', paraBasico: true, Icone: Calendar },
  { para: '/ordens', texto: 'Ordens', paraBasico: true, Icone: ClipboardList },
  { para: '/clientes', texto: 'Clientes', Icone: Users },
  { para: '/despesas', texto: 'Despesas', badge: true, Icone: Receipt },
  { para: '/fornecedores', texto: 'Fornecedores', Icone: Truck },
  { para: '/financeiro', texto: 'Financeiro', Icone: TrendingUp },
  { para: '/dre', texto: 'DRE', somenteAdmin: true, Icone: FileText },
  { para: '/pessoal', texto: 'Pessoal', somenteAdmin: true, Icone: Wallet },
  { para: '/funcionarios', texto: 'Funcionários', somenteAdmin: true, Icone: HardHat },
  { para: '/recorrentes', texto: 'Recorrentes', somenteAdmin: true, Icone: RefreshCw },
  { para: '/retornos', texto: 'Retornos', Icone: PhoneCall },
  { para: '/followup', texto: 'Follow-up', Icone: MessageCircle },
  { para: '/servicos', texto: 'Catálogo', Icone: Wrench },
  { para: '/configuracoes', texto: 'Config', somenteAdmin: true, Icone: Settings },
  { para: '/plataforma', texto: 'Plataforma', somenteSuperAdmin: true, Icone: Building2 },
];

export default function Layout() {
  const usuario = getUser();
  const navigate = useNavigate();
  const local = useLocation();
  const [alertas, setAlertas] = useState(null);
  const [abertoMobile, setAbertoMobile] = useState(false);
  const [assin, setAssin] = useState(null);
  const { tema, alternar } = useTema();

  // Status da assinatura da oficina (pra bloquear/avisar). Busca uma vez.
  useEffect(() => {
    let cancelado = false;
    api.assinaturaMinha().then((a) => !cancelado && setAssin(a)).catch(() => {});
    return () => { cancelado = true; };
  }, []);

  // Recarrega ao trocar de tela: o contador não pode ficar velho
  // depois que o usuário dá baixa num boleto.
  useEffect(() => {
    let cancelado = false;
    api.alertas(7).then((a) => !cancelado && setAlertas(a)).catch(() => {});
    setAbertoMobile(false); // fecha o drawer ao navegar
    return () => { cancelado = true; };
  }, [local.pathname]);

  const pendencias = (alertas?.atrasadas.length || 0) + (alertas?.vence_hoje.length || 0);
  const ehBasico = usuario?.role === 'basico';
  const itens = MENU.filter((m) => {
    if (ehBasico) return m.paraBasico === true;
    if (m.somenteSuperAdmin) return usuario?.super_admin === true;
    if (m.somenteAdmin) return usuario?.role === 'admin';
    return true;
  });

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
            `group relative flex items-center gap-3 rounded-lg px-3 py-2 font-display text-[13px]
             font-medium uppercase tracking-[.06em] transition duration-150
             ${isActive
               ? 'bg-maninho-600 text-white shadow-sm before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-ouro-500'
               : 'text-white/65 hover:bg-white/[.07] hover:text-white'}`}>
          <Icone size={18} strokeWidth={2}
            className="shrink-0 transition group-hover:scale-105" aria-hidden="true" />
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
      <aside className="relative hidden lg:flex sticky top-0 h-screen w-[232px] shrink-0
                        flex-col overflow-hidden bg-gradient-to-b from-maninho-800 via-painel-900 to-painel-950
                        shadow-painel">
        {/* Arco gigante como marca d'água, cortando o rodapé da barra. */}
        <svg viewBox="0 0 64 30" aria-hidden="true" fill="none"
          className="pointer-events-none absolute -left-6 bottom-8 h-40 w-auto opacity-[.06]">
          <path d="M2 27C10 9 26 2 44 2" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <path d="M20 27C26 15 36 9 48 8" stroke="#D4A843" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
        {/* Fio dourado no topo, como a borda do painel da fachada. */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-ouro-500 to-transparent" />
        <div className="relative border-b border-white/10 px-5 pb-4 pt-5">
          <Marca variante="claro" tamanho="sm" />
        </div>
        <div className="relative flex flex-1 flex-col overflow-y-auto p-3">
          <Links />
        </div>
        <div className="relative border-t border-white/10 p-4">
          <div className="mb-3">
            <p className="truncate text-sm font-semibold text-white">{usuario?.nome}</p>
            <p className="font-display text-[10px] uppercase tracking-[.14em] text-white/45">
              {usuario?.role}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <ToggleTema tema={tema} alternar={alternar} className="w-full justify-center" />
            <button onClick={sair}
              className="w-full rounded border border-white/20 px-3 py-1.5 font-display text-[11px]
                         font-medium uppercase tracking-[.1em] text-white/80
                         transition hover:border-white/40 hover:bg-white/5 hover:text-white">
              Sair
            </button>
          </div>
          <p title={VERSAO_DETALHE}
            className="mt-3 text-center font-display text-[10px] uppercase tracking-[.14em] text-white/45">
            {VERSAO_ROTULO}
          </p>
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
            <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col
                              bg-gradient-to-b from-maninho-800 via-painel-900 to-painel-950 shadow-2xl">
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
                <div className="flex flex-col gap-2">
                  <ToggleTema tema={tema} alternar={alternar} className="w-full justify-center" />
                  <button onClick={sair}
                    className="w-full rounded border border-white/20 px-3 py-1.5 font-display text-[11px]
                               font-medium uppercase tracking-[.1em] text-white/80 hover:bg-white/5">
                    Sair
                  </button>
                </div>
                <p title={VERSAO_DETALHE}
                  className="mt-3 text-center font-display text-[10px] uppercase tracking-[.14em] text-white/45">
                  {VERSAO_ROTULO}
                </p>
              </div>
            </aside>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {assin?.avaliacao?.bloqueada ? (
            <BloqueioAssinatura info={assin} onSair={sair} />
          ) : (
            <>
              {assin?.avaliacao?.em_graca && (
                <div className="mb-5 rounded-lg border border-ouro-300 bg-ouro-100 px-4 py-3 text-sm text-ouro-800">
                  <strong>⚠️ {assin.avaliacao.motivo || 'Assinatura pendente'}.</strong>{' '}
                  {assin.avaliacao.dias_restantes != null && (
                    <>Acesso liberado por mais <strong>{assin.avaliacao.dias_restantes} dia(s)</strong>. </>
                  )}
                  Regularize com o responsável pra não perder o acesso.
                </div>
              )}
              <Outlet />
            </>
          )}
        </main>

        {/* "Bom dia!" — só na primeira entrada do dia (por usuário) */}
        <ResumoDiario />

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

/** Tela de acesso bloqueado por assinatura vencida. */
function BloqueioAssinatura({ info, onSair }) {
  const motivo = info?.avaliacao?.motivo || 'Assinatura pendente';
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="card p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-3xl">
          🔒
        </div>
        <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-maninho-800">
          Acesso suspenso
        </h1>
        <p className="mt-2 text-sm text-slate-600">{motivo}.</p>
        <p className="mt-4 text-sm text-slate-600">
          Pra reativar, entre em contato com o responsável pela plataforma e
          regularize a assinatura. Assim que o pagamento for confirmado, o
          acesso volta na hora.
        </p>
        <button onClick={onSair}
          className="btn-ghost mt-6">
          Sair
        </button>
      </div>
    </div>
  );
}
