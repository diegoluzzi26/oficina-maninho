import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from '../lib/api';
import { Alerta, Spinner, Campo } from '../components/ui';
import { Marca, Selo } from '../components/Marca';

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

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Lado esquerdo: o letreiro da fachada */}
      <div className="relative hidden overflow-hidden bg-painel-900 lg:block">
        {/* Arco gigante como marca d'água, cortando a diagonal */}
        <svg viewBox="0 0 64 30" className="absolute -left-[12%] top-[6%] h-[105%] w-auto opacity-[.07]"
          fill="none" aria-hidden="true">
          <path d="M2 27C10 9 26 2 44 2" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <path d="M20 27C26 15 36 9 48 8" stroke="#D4A843" strokeWidth="3.2" strokeLinecap="round" />
        </svg>

        {/* Halo azul, como a iluminação da vitrine à noite */}
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-maninho-600 blur-[110px] opacity-45" />

        <div className="relative flex h-full flex-col justify-between p-11">
          <Marca variante="claro" tamanho="lg" />

          <div>
            <p className="max-w-md font-marca text-[38px] leading-[1.15] text-white/90">
              Cuidando do seu carro<br />desde 1997.
            </p>
            <div className="mt-7 flex flex-wrap gap-2.5">
              {['Elétrica', 'Mecânica', 'Injeção eletrônica', 'Ar-condicionado'].map((s) => (
                <span key={s}
                  className="rounded-full border border-white/15 px-3.5 py-1.5 font-display
                             text-[11px] uppercase tracking-[.14em] text-white/70">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between">
            <p className="font-display text-[10.5px] uppercase tracking-[.2em] text-white/35">
              RS-020, 1055 · Gravataí/RS
            </p>
            <Selo className="h-16 w-16 opacity-30" claro />
          </div>
        </div>
      </div>

      {/* Lado direito: formulário */}
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="anima mb-8 lg:hidden">
            <Marca variante="escuro" tamanho="md" />
          </div>

          <div className="anima mb-7 hidden lg:block">
            <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-maninho-800">
              Sistema de gestão
            </h1>
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
                placeholder="voce@maninho.com.br" />
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
        </div>
      </div>
    </div>
  );
}
