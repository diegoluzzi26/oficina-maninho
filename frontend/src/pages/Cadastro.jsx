import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check } from 'lucide-react';
import { api, setSession } from '../lib/api';
import { Alerta, Spinner, Campo } from '../components/ui';
import { Marca, Engrenagem } from '../components/Marca';

/**
 * Cadastro self-service: a oficina cria a conta de teste (14 dias) sozinha,
 * a partir da landing (gestaotorque.com.br/cadastro -> /app/#/cadastro).
 * Ao concluir, já entra logada; o aceite dos termos vem no primeiro acesso.
 */
const VAZIO = { oficina: '', nome: '', email: '', telefone: '', cidade: '', senha: '', site: '' };

/** (51) 99999-9999 enquanto digita. */
function mascaraFone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Cadastro() {
  const [f, setF] = useState(VAZIO);
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [errosCampo, setErrosCampo] = useState({});
  const [enviando, setEnviando] = useState(false);
  const navigate = useNavigate();

  const set = (campo) => (e) => {
    const v = campo === 'telefone' ? mascaraFone(e.target.value) : e.target.value;
    setF((x) => ({ ...x, [campo]: v }));
    setErrosCampo((x) => ({ ...x, [campo]: undefined }));
  };

  async function enviar(e) {
    e.preventDefault();
    setErro(''); setErrosCampo({}); setEnviando(true);
    try {
      const { token, usuario } = await api.cadastro(f);
      setSession(token, usuario);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.detalhes?.length) {
        setErrosCampo(Object.fromEntries(err.detalhes.map((d) => [d.campo, d.erro])));
        setErro('Confira os campos destacados.');
      } else {
        setErro(err.message);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen font-marca-texto lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Painel da plataforma ---------- */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-maninho-700 via-maninho-800 to-painel-950 lg:block">
        <Engrenagem
          className="pointer-events-none absolute -right-20 top-1/2 h-[520px] w-[520px] -translate-y-1/2 opacity-[.05]"
          engrenagem="#ffffff" h="#ffffff" />
        <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-ouro-500 opacity-25 blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-ouro-500 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-11">
          <Marca variante="claro" tamanho="md" />
          <div>
            <p className="max-w-md font-marca text-[40px] font-extrabold leading-[1.1] tracking-[-.02em] text-white">
              14 dias grátis<br />pra sua oficina<br />
              <span className="text-ouro-500">trazer cliente de volta.</span>
            </p>
            <ul className="mt-7 space-y-2.5">
              {['Sem cartão de crédito', 'Sem taxa de implantação', 'Cancela quando quiser',
                'Ajuda pra configurar pelo WhatsApp'].map((s) => (
                <li key={s} className="flex items-center gap-2.5 text-sm text-white/80">
                  <Check size={16} className="text-ouro-500" /> {s}
                </li>
              ))}
            </ul>
          </div>
          <p className="font-marca text-[10.5px] uppercase tracking-[.2em] text-white/35">
            Gestão Torque · plataforma de gestão para oficinas
          </p>
        </div>
      </div>

      {/* ---------- Formulário ---------- */}
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="anima mb-6 lg:hidden">
            <Marca variante="escuro" tamanho="sm" />
          </div>

          <div className="anima mb-6">
            <h1 className="font-marca text-xl font-bold text-maninho-800">Teste grátis por 14 dias</h1>
            <p className="mt-1 text-sm text-slate-500">Crie a conta da sua oficina em 1 minuto.</p>
          </div>

          <form onSubmit={enviar} className="anima space-y-3.5" style={{ animationDelay: '60ms' }}>
            {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

            <Campo label="Nome da oficina" obrigatorio erro={errosCampo.oficina}>
              <input className="input" value={f.oficina} onChange={set('oficina')} required autoFocus
                autoComplete="organization" placeholder="Auto Elétrica Exemplo" />
            </Campo>

            <Campo label="Seu nome" obrigatorio erro={errosCampo.nome}>
              <input className="input" value={f.nome} onChange={set('nome')} required
                autoComplete="name" placeholder="Como você se chama" />
            </Campo>

            <div className="grid grid-cols-[1.25fr_1fr] gap-3">
              <Campo label="WhatsApp" obrigatorio erro={errosCampo.telefone}>
                <input className="input" type="tel" inputMode="numeric" value={f.telefone}
                  onChange={set('telefone')} required autoComplete="tel" placeholder="(51) 99999-9999" />
              </Campo>
              <Campo label="Cidade" erro={errosCampo.cidade}>
                <input className="input" value={f.cidade} onChange={set('cidade')}
                  autoComplete="address-level2" placeholder="Gravataí" />
              </Campo>
            </div>

            <Campo label="E-mail" obrigatorio erro={errosCampo.email} ajuda="Você vai usar pra entrar no sistema.">
              <input type="email" className="input" value={f.email} onChange={set('email')} required
                autoComplete="username" placeholder="voce@oficina.com.br" />
            </Campo>

            <Campo label="Senha" obrigatorio erro={errosCampo.senha} ajuda="Pelo menos 8 caracteres.">
              <div className="relative">
                <input type={verSenha ? 'text' : 'password'} className="input pr-10" value={f.senha}
                  onChange={set('senha')} required minLength={8} autoComplete="new-password"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setVerSenha((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center
                             text-slate-400 transition hover:text-slate-600"
                  aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'} aria-pressed={verSenha}>
                  {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Campo>

            {/* Armadilha pra robô: fora da tela, sem foco por teclado */}
            <input type="text" name="site" value={f.site} onChange={set('site')} tabIndex={-1}
              autoComplete="off" aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

            <button type="submit" className="btn-primary w-full py-2.5" disabled={enviando}>
              {enviando ? <><Spinner className="h-4 w-4" /> Criando sua oficina…</> : 'Criar conta grátis'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Sem cartão. Depois dos 14 dias, você escolhe o plano ou não paga nada.
          </p>
          <p className="mt-3 text-center text-sm text-slate-600">
            Já tem conta?{' '}
            <Link to="/login" className="font-semibold text-maninho-700 hover:underline">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
