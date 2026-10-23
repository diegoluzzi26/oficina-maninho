import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import {
  useIdentidadeOficina, publicarIdentidade, corTextoSobre, iniciais,
  COR_PRIMARIA_PADRAO, COR_SECUNDARIA_PADRAO,
} from '../lib/oficina';
import { Alerta, Campo, Skeleton, Spinner } from './ui';

const MB = 1024 * 1024;
const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const SUGESTOES = [
  '#6e44ff', '#0f2e4d', '#1d4ed8', '#0891b2', '#0d9488', '#15803d',
  '#ca8a04', '#ea580c', '#ff5a36', '#dc2626', '#db2777', '#1f1a24',
];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Seletor de uma cor: amostra nativa + campo hex + atalhos. */
function SeletorCor({ label, ajuda, valor, onChange }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);

  return (
    <Campo label={label} ajuda={ajuda}>
      <div className="flex items-center gap-2">
        <input type="color" value={valor} onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
          aria-label={`${label} (seletor)`} />
        <input className="input w-28 min-w-0 font-mono uppercase" value={texto} maxLength={7}
          onChange={(e) => {
            const t = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setTexto(t);
            if (HEX.test(t)) onChange(t.toLowerCase());
          }}
          onBlur={() => setTexto(valor)} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGESTOES.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)} title={c}
            className={`h-6 w-6 rounded-md border transition hover:scale-110
              ${c === valor ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-black/10'}`}
            style={{ backgroundColor: c }} aria-label={`Usar ${c}`} />
        ))}
      </div>
    </Campo>
  );
}

/**
 * Aba "Identidade visual": logo e as 2 cores da oficina. Aparecem na tela
 * de login, na barra lateral e na impressão da OS.
 */
export default function IdentidadeVisual() {
  const ident = useIdentidadeOficina();
  const [primaria, setPrimaria] = useState(COR_PRIMARIA_PADRAO);
  const [secundaria, setSecundaria] = useState(COR_SECUNDARIA_PADRAO);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvandoCores, setSalvandoCores] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const arquivoRef = useRef(null);

  // Sincroniza o formulário quando a identidade chega (ou muda).
  useEffect(() => {
    if (!ident) return;
    setPrimaria(ident.primaria);
    setSecundaria(ident.secundaria);
  }, [ident?.primaria, ident?.secundaria]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ident) return <Skeleton className="h-[420px]" />;

  const coresMudaram = primaria !== ident.primaria || secundaria !== ident.secundaria;

  async function trocarLogo(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    setErro(''); setOk('');
    if (!TIPOS_LOGO.includes(arquivo.type)) return setErro('A logo precisa ser PNG, JPG ou WebP.');
    if (arquivo.size > MB) return setErro('A logo precisa ter no máximo 1 MB.');
    setEnviandoLogo(true);
    try {
      publicarIdentidade(await api.enviarLogoOficina(arquivo));
      setOk('Logo atualizada.');
    } catch (err) { setErro(err.message); }
    finally { setEnviandoLogo(false); }
  }

  async function removerLogo() {
    setErro(''); setOk(''); setEnviandoLogo(true);
    try {
      publicarIdentidade(await api.removerLogoOficina());
      setOk('Logo removida.');
    } catch (err) { setErro(err.message); }
    finally { setEnviandoLogo(false); }
  }

  async function salvarCores(e) {
    e.preventDefault();
    setErro(''); setOk(''); setSalvandoCores(true);
    try {
      publicarIdentidade(await api.atualizarMinhaOficina({
        cor_primaria: primaria, cor_secundaria: secundaria,
      }));
      setOk('Cores salvas.');
    } catch (err) { setErro(err.message); }
    finally { setSalvandoCores(false); }
  }

  async function restaurarPadrao() {
    setErro(''); setOk(''); setSalvandoCores(true);
    try {
      publicarIdentidade(await api.atualizarMinhaOficina({
        cor_primaria: null, cor_secundaria: null,
      }));
      setOk('Cores voltaram ao padrão.');
    } catch (err) { setErro(err.message); }
    finally { setSalvandoCores(false); }
  }

  const textoPrimaria = corTextoSobre(primaria);

  return (
    <div className="space-y-5">
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {ok && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Logo */}
          <div className="card p-5">
            <h2 className="titulo-secao">Logo da oficina</h2>
            <p className="mb-4 text-xs text-slate-500">
              Aparece na tela de login, na barra lateral e na impressão da OS.
              PNG, JPG ou WebP até 1 MB — de preferência com fundo transparente.
            </p>
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex h-28 w-56 items-center justify-center rounded-xl border-2 border-dashed
                              border-slate-200 bg-slate-50 p-3">
                {ident.logo_url
                  ? <img src={ident.logo_url} alt={`Logo ${ident.nome}`}
                      className="max-h-full max-w-full object-contain" />
                  : <span className="text-center text-xs text-slate-400">Sem logo cadastrada</span>}
              </div>
              <div className="flex flex-col gap-2">
                <input ref={arquivoRef} type="file" accept={TIPOS_LOGO.join(',')}
                  className="hidden" onChange={trocarLogo} />
                <button type="button" className="btn-primary" disabled={enviandoLogo}
                  onClick={() => arquivoRef.current?.click()}>
                  {enviandoLogo
                    ? <><Spinner className="h-4 w-4" /> Enviando…</>
                    : <><ImagePlus size={16} /> {ident.logo_url ? 'Trocar logo' : 'Enviar logo'}</>}
                </button>
                {ident.logo_url && (
                  <button type="button" className="btn-ghost" disabled={enviandoLogo}
                    onClick={removerLogo}>
                    <Trash2 size={16} /> Remover
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Cores */}
          <form onSubmit={salvarCores} className="card p-5">
            <h2 className="titulo-secao">Cores da oficina</h2>
            <p className="mb-4 text-xs text-slate-500">
              A cor principal vai nos destaques (botão do login, cabeçalho da OS);
              a secundária, nos detalhes e faixas.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <SeletorCor label="Cor principal" valor={primaria} onChange={setPrimaria} />
              <SeletorCor label="Cor secundária" valor={secundaria} onChange={setSecundaria} />
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" className="btn-ghost" onClick={restaurarPadrao}
                disabled={salvandoCores || (!ident.cor_primaria && !ident.cor_secundaria)}>
                Restaurar padrão
              </button>
              <button type="submit" className="btn-primary" disabled={salvandoCores || !coresMudaram}>
                {salvandoCores ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Salvar cores'}
              </button>
            </div>
          </form>
        </div>

        {/* Prévia */}
        <div className="card h-fit p-5">
          <h2 className="titulo-secao">Prévia</h2>
          <p className="mb-4 text-xs text-slate-500">Como fica no login da oficina.</p>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${primaria}, ${secundaria})` }} />
            <div className="space-y-3 p-5">
              <div className="flex h-16 items-center justify-center">
                {ident.logo_url
                  ? <img src={ident.logo_url} alt="" className="max-h-16 max-w-[220px] object-contain" />
                  : (
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl font-display
                                      text-base font-extrabold"
                        style={{ backgroundColor: primaria, color: textoPrimaria }}>
                        {iniciais(ident.nome)}
                      </div>
                      <span className="font-display text-sm font-extrabold" style={{ color: primaria }}>
                        {ident.nome}
                      </span>
                    </div>
                  )}
              </div>
              <div className="h-8 rounded-lg border border-slate-200 bg-slate-50" />
              <div className="h-8 rounded-lg border border-slate-200 bg-slate-50" />
              <div className="flex h-9 items-center justify-center rounded-lg text-sm font-semibold"
                style={{ backgroundColor: primaria, color: textoPrimaria }}>
                Entrar
              </div>
              <p className="text-center text-[11px]" style={{ color: secundaria }}>
                ● cor secundária nos detalhes
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
