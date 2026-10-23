import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from '../lib/api';
import { Alerta, Spinner, Campo } from '../components/ui';
import { Marca, Engrenagem } from '../components/Marca';

/** Iniciais a partir do nome da oficina (até 2 letras). */
function iniciais(nome = '') {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || 'OF';
}

/**
 * Slot da logo da oficina. Se a oficina tem `logo_url`, mostra a imagem;
 * senão cai num selo com as iniciais + nome. Sem oficina, placeholder.
 */
function LogoOficina({ oficina }) {
  if (oficina?.logo_url) {
    return (
      <div className="flex h-24 items-center justify-center">
        <img src={oficina.logo_url} alt={oficina.nome}
          className="max-h-20 w-auto max-w-[260px] object-contain" />
      </div>
    );
  }
  if (oficina) {
    return (
      <div className="flex items-center justify-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-maninho-600
                        font-display text-xl font-extrabold text-white">
          {iniciais(oficina.nome)}
        </div>
        <div className="font-display text-lg font-extrabold leading-tight text-maninho-800">
          {oficina.nome}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-24 w-full max-w-[300px] flex-col items-center justify-center gap-1
                    rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center">
      <span className="text-sm font-semibold text-slate-600">Logo da oficina</span>
      <span className="text-xs text-slate-400">definida em Configurações</span>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [oficinaSlug, setOficinaSlug] = useState('');
  const [oficinas, setOficinas] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  // Carrega oficinas ao montar. Se só tiver uma, pré-seleciona e
  // esconde o dropdown (login não muda pra quem tem 1 oficina só).
  useEffect(() => {
    api.oficinas()
      .then((lista) => {
        setOficinas(lista);
        if (lista.length === 1) setOficinaSlug(lista[0].slug);
      })
      .catch(() => setOficinas([]));
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setErro(''); setEnviando(true);
    try {
      const { token, usuario } = await api.login(email, senha, oficinaSlug || undefined);
      setSession(token, usuario);
      navigate('/', { replace: true });
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const mostrarDropdown = (oficinas?.length || 0) > 1;
  const oficinaSel = oficinas?.find((o) => o.slug === oficinaSlug) || null;

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Painel da plataforma (Gestão Torque) ---------- */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-maninho-700 via-maninho-800 to-painel-950 lg:block">
        {/* Engrenagem gigante como marca d'água */}
        <Engrenagem
          className="pointer-events-none absolute -right-20 top-1/2 h-[520px] w-[520px] -translate-y-1/2 opacity-[.05]"
          engrenagem="#ffffff" h="#ffffff" />
        {/* Halo laranja, luz da vitrine */}
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-ouro-500 opacity-25 blur-[120px]" />
        {/* Fio laranja no topo */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-ouro-500 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-11">
          <Marca variante="claro" tamanho="md" />

          <div>
            <p className="max-w-md font-display text-[40px] font-extrabold leading-[1.1] tracking-[-.02em] text-white">
              Gestão completa<br />da sua oficina,<br />
              <span className="text-ouro-500">num lugar só.</span>
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              {['Ordens de serviço', 'Financeiro', 'Revisão no WhatsApp', 'Kanban do pátio'].map((s) => (
                <span key={s}
                  className="rounded-full border border-white/15 px-3.5 py-1.5 font-display
                             text-[11px] uppercase tracking-[.12em] text-white/70">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <p className="font-display text-[10.5px] uppercase tracking-[.2em] text-white/35">
            Gestão Torque · plataforma de gestão para oficinas
          </p>
        </div>
      </div>

      {/* ---------- Formulário ---------- */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          {/* Marca da plataforma no mobile (o painel esquerdo some) */}
          <div className="anima mb-8 lg:hidden">
            <Marca variante="escuro" tamanho="sm" />
          </div>

          {/* Slot da logo da oficina */}
          <div className="anima mb-6 flex justify-center">
            <LogoOficina oficina={oficinaSel} />
          </div>

          <div className="anima mb-6 text-center" style={{ animationDelay: '40ms' }}>
            <h1 className="font-display text-xl font-bold text-maninho-800">Bem-vindo de volta</h1>
            <p className="mt-1 text-sm text-slate-500">Entre com seu usuário para continuar.</p>
          </div>

          <form onSubmit={enviar} className="anima space-y-4" style={{ animationDelay: '80ms' }}>
            {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

            {mostrarDropdown && (
              <Campo label="Oficina" obrigatorio>
                <select className="input" value={oficinaSlug} required
                  onChange={(e) => setOficinaSlug(e.target.value)}>
                  <option value="">Selecione…</option>
                  {oficinas.map((o) => (
                    <option key={o.id} value={o.slug}>{o.nome}</option>
                  ))}
                </select>
              </Campo>
            )}

            <Campo label="E-mail" obrigatorio>
              <input type="email" className="input" value={email} autoComplete="username"
                onChange={(e) => setEmail(e.target.value)} required autoFocus
                placeholder="voce@oficina.com.br" />
            </Campo>

            <Campo label="Senha" obrigatorio>
              <input type="password" className="input" value={senha} autoComplete="current-password"
                onChange={(e) => setSenha(e.target.value)} required placeholder="••••••••" />
            </Campo>

            <button type="submit" className="btn-primary w-full py-2.5" disabled={enviando}>
              {enviando ? <><Spinner className="h-4 w-4" /> Entrando…</> : 'Entrar'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-400">
            Esqueceu a senha? Peça ao administrador para redefinir.
          </p>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Engrenagem className="h-4 w-4" /> por <span className="font-semibold text-slate-500">Gestão Torque</span>
          </div>
        </div>
      </div>
    </div>
  );
}
