import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, ClipboardList, Users, Receipt, Truck,
  TrendingUp, Wallet, HardHat, RefreshCw, PhoneCall, MessageCircle,
  Wrench, Settings, Menu, X, FileText, Building2, UserCog, BadgeCheck,
} from 'lucide-react';
import { api, getUser, getToken, setSession, clearSession } from '../lib/api';
import { temPermissao, MODULO_DA_ROTA } from '../lib/permissoes';
import { Marca, MarcaCompacta, Arco } from './Marca';
import ResumoDiario from './ResumoDiario';
import { useTema, ToggleTema } from '../lib/tema';
import { VERSAO_ROTULO, VERSAO_DETALHE } from '../lib/versao';
import { useIdentidadeOficina, corTextoSobre, iniciais } from '../lib/oficina';

/** Logo + nome da oficina logada, com a faixa nas 2 cores dela. */
function OficinaAtual({ ident }) {
  if (!ident) return null;
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-white/[.06] p-2">
      {ident.logo_url ? (
        <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-white p-1">
          <img src={ident.logo_url} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-display
                        text-xs font-extrabold"
          style={{ backgroundColor: ident.primaria, color: corTextoSobre(ident.primaria) }}>
          {iniciais(ident.nome)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-white" title={ident.nome}>
          {ident.nome}
        </p>
        <div className="mt-1 h-[3px] w-10 rounded-full"
          style={{ background: `linear-gradient(90deg, ${ident.primaria}, ${ident.secundaria})` }} />
      </div>
    </div>
  );
}

// Itens com rota em MODULO_DA_ROTA só aparecem se o admin liberou o módulo
// pro usuário (Equipe). somenteAdmin restringe ao papel admin.
// recurso = só aparece se o plano da oficina inclui (src/config/planos.js).
const MENU = [
  { para: '/', texto: 'Painel', exato: true, Icone: LayoutDashboard },
  { para: '/agenda', texto: 'Agenda', Icone: Calendar },
  { para: '/ordens', texto: 'Ordens', Icone: ClipboardList },
  { para: '/clientes', texto: 'Clientes', Icone: Users },
  { para: '/despesas', texto: 'Despesas', badge: true, Icone: Receipt },
  { para: '/fornecedores', texto: 'Fornecedores', Icone: Truck },
  { para: '/financeiro', texto: 'Financeiro', Icone: TrendingUp },
  { para: '/dre', texto: 'DRE', somenteAdmin: true, recurso: 'gestao', Icone: FileText },
  { para: '/pessoal', texto: 'Pessoal', somenteAdmin: true, Icone: Wallet },
  { para: '/funcionarios', texto: 'Funcionários', somenteAdmin: true, recurso: 'funcionarios', Icone: HardHat },
  { para: '/recorrentes', texto: 'Recorrentes', somenteAdmin: true, recurso: 'gestao', Icone: RefreshCw },
  { para: '/retornos', texto: 'Retornos', recurso: 'followup', Icone: PhoneCall },
  { para: '/followup', texto: 'Follow-up', recurso: 'followup', Icone: MessageCircle },
  { para: '/servicos', texto: 'Catálogo', Icone: Wrench },
  { para: '/equipe', texto: 'Equipe', somenteAdmin: true, Icone: UserCog },
  { para: '/plano', texto: 'Plano', somenteAdmin: true, Icone: BadgeCheck },
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
  const [contrato, setContrato] = useState(null);
  const [, setPermissoes] = useState(usuario?.permissoes);
  const { tema, alternar } = useTema();
  const identidade = useIdentidadeOficina();

  // Status de assinatura e contrato da oficina (pra bloquear/avisar).
  useEffect(() => {
    let cancelado = false;
    api.assinaturaMinha().then((a) => !cancelado && setAssin(a)).catch(() => {});
    api.contratoStatus().then((c) => !cancelado && setContrato(c)).catch(() => {});
    // Permissões frescas: o admin pode ter mudado desde o login.
    api.minhasPermissoes().then(({ minhas }) => {
      if (cancelado) return;
      setSession(getToken(), { ...getUser(), permissoes: minhas });
      setPermissoes(minhas);
    }).catch(() => {});
    return () => { cancelado = true; };
  }, []);

  function recarregarContrato() {
    api.contratoStatus().then(setContrato).catch(() => {});
  }

  // Recarrega ao trocar de tela: o contador não pode ficar velho
  // depois que o usuário dá baixa num boleto.
  useEffect(() => {
    let cancelado = false;
    api.alertas(7).then((a) => !cancelado && setAlertas(a)).catch(() => {});
    setAbertoMobile(false); // fecha o drawer ao navegar
    return () => { cancelado = true; };
  }, [local.pathname]);

  const pendencias = (alertas?.atrasadas.length || 0) + (alertas?.vence_hoje.length || 0);
  const itens = MENU.filter((m) => {
    if (m.recurso && assin?.recursos && !assin.recursos.includes(m.recurso)) return false;
    if (MODULO_DA_ROTA[m.para] && !temPermissao(MODULO_DA_ROTA[m.para])) return false;
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
        {/* Engrenagem gigante como marca d'água no rodapé da barra. */}
        <Arco claro className="pointer-events-none absolute -left-10 -bottom-8 h-56 w-auto opacity-[.05]" />
        {/* Fio dourado no topo, como a borda do painel da fachada. */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-ouro-500 to-transparent" />
        <div className="relative border-b border-white/10 px-5 pb-4 pt-5">
          <Marca variante="claro" tamanho="sm" />
          <OficinaAtual ident={identidade} />
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
                <div className="mb-3 [&>div]:mt-0"><OficinaAtual ident={identidade} /></div>
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
          ) : contrato?.pendente ? (
            <AceiteContrato contrato={contrato} onAceito={recarregarContrato} onSair={sair} />
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
              {MODULO_DA_ROTA[local.pathname] && local.pathname !== '/'
                && !temPermissao(MODULO_DA_ROTA[local.pathname])
                ? <SemAcesso />
                : <Outlet />}
            </>
          )}
        </main>

        {/* "Bom dia!" — só na primeira entrada do dia (por usuário) */}
        <ResumoDiario />

        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-6 sm:px-8">
          <p className="border-t border-slate-200 pt-4 text-center font-display text-[10.5px]
                        uppercase tracking-[.2em] text-slate-500">
            Gestão Torque · sua oficina, organizada
          </p>
        </footer>
      </div>
    </div>
  );
}

/** Tela aberta por link direto sem o módulo liberado. */
export function SemAcesso() {
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="card p-8">
        <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-maninho-800">
          Sem acesso a esta área
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          O administrador da oficina não liberou esta tela pro seu usuário.
          Se precisar dela, peça pra ele ajustar suas permissões em Equipe.
        </p>
      </div>
    </div>
  );
}

/** Tela de aceite do contrato / termos de uso (pendente). */
function AceiteContrato({ contrato, onAceito, onSair }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const podeAceitar = contrato?.pode_aceitar;
  const texto = contrato?.contrato?.texto || '';
  const titulo = contrato?.contrato?.titulo || 'Termos de uso';

  async function aceitar() {
    setSalvando(true); setErro('');
    try {
      await api.aceitarContrato();
      onAceito();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="card p-6">
        <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-maninho-800">
          {titulo}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {podeAceitar
            ? 'Leia e aceite para continuar usando o sistema.'
            : 'Os termos precisam ser aceitos pelo administrador da oficina para liberar o acesso.'}
        </p>
        {erro && (
          <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {erro}
          </div>
        )}
        <div className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-700">
          {texto || 'Nenhum texto de contrato publicado.'}
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={onSair} className="btn-ghost">Sair</button>
          {podeAceitar ? (
            <button onClick={aceitar} className="btn-primary" disabled={salvando}>
              {salvando ? 'Registrando…' : 'Li e aceito os termos'}
            </button>
          ) : (
            <span className="text-xs text-slate-500">Aguardando o administrador.</span>
          )}
        </div>
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
