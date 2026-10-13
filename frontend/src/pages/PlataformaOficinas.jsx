import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

function dataBR(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

// Sugere um slug a partir do nome: minúsculas, sem acento, só [a-z0-9_].
function sugerirSlug(nome) {
  return (nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 31);
}

function FormOficina({ aberto, onFechar, onCriada }) {
  const vazio = { slug: '', nome: '', admin: { nome: '', email: '', senha: '' } };
  const [form, setForm] = useState(vazio);
  const [slugTocado, setSlugTocado] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) { setForm(vazio); setSlugTocado(false); setErro(''); }
  }, [aberto]);

  const setNome = (v) => setForm((f) => ({
    ...f, nome: v, slug: slugTocado ? f.slug : sugerirSlug(v),
  }));
  const setAdmin = (k) => (v) => setForm((f) => ({ ...f, admin: { ...f.admin, [k]: v } }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const r = await api.adminCriarOficina({
        slug: form.slug.trim(),
        nome: form.nome.trim(),
        admin: {
          nome: form.admin.nome.trim(),
          email: form.admin.email.trim(),
          senha: form.admin.senha,
        },
      });
      onCriada(r);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto={aberto} largura="max-w-xl" titulo="Nova oficina" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nome da oficina" obrigatorio>
            <input className="input" value={form.nome}
              onChange={(e) => setNome(e.target.value)} required autoFocus
              placeholder="Ex: Auto Center Silva" />
          </Campo>
          <Campo label="Slug (identificador)" obrigatorio
            ajuda="3-31 caracteres: letras minúsculas, dígitos e _ (começa com letra)">
            <input className="input font-mono" value={form.slug}
              onChange={(e) => { setSlugTocado(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
              required pattern="[a-z][a-z0-9_]{2,30}"
              placeholder="autocentersilva" />
          </Campo>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-600">
            Admin da oficina
          </p>
          <div className="space-y-3">
            <Campo label="Nome" obrigatorio>
              <input className="input" value={form.admin.nome}
                onChange={(e) => setAdmin('nome')(e.target.value)} required
                placeholder="Nome do dono/responsável" />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="E-mail" obrigatorio>
                <input type="email" className="input" value={form.admin.email}
                  onChange={(e) => setAdmin('email')(e.target.value)} required
                  placeholder="dono@oficina.com" />
              </Campo>
              <Campo label="Senha inicial" obrigatorio ajuda="Mínimo 8 caracteres">
                <input type="text" className="input font-mono" value={form.admin.senha}
                  onChange={(e) => setAdmin('senha')(e.target.value)} required minLength={8}
                  placeholder="senha de acesso" />
              </Campo>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            A senha aparece em texto de propósito — anote e passe pro dono com segurança.
            Ele troca depois no próprio acesso.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Criando…</> : 'Criar oficina'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PlataformaOficinas() {
  const [oficinas, setOficinas] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ok, setOk] = useState('');

  function carregar() {
    setErro('');
    api.adminOficinas().then(setOficinas).catch((e) => setErro(e.message));
  }
  useEffect(carregar, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Plataforma · Oficinas
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Provisione novas oficinas no sistema. Cada uma ganha banco próprio e um admin.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setOk(''); setAberto(true); }}>
          + Nova oficina
        </button>
      </div>

      {ok && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!oficinas ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : oficinas.length === 0 ? (
        <Vazio titulo="Nenhuma oficina" descricao="Crie a primeira com o botão acima." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Usuários</th>
                <th className="px-4 py-2">Criada em</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {oficinas.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-semibold text-slate-800">{o.nome}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{o.slug}</td>
                  <td className="px-4 py-2 tnum">{o.usuarios}</td>
                  <td className="px-4 py-2 text-slate-600">{dataBR(o.criado_em)}</td>
                  <td className="px-4 py-2">
                    {o.ativo
                      ? <span className="text-emerald-700">Ativa</span>
                      : <span className="text-rose-700">Inativa</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormOficina aberto={aberto}
        onFechar={() => setAberto(false)}
        onCriada={(o) => {
          setAberto(false);
          setOk(`Oficina "${o.nome}" criada. O admin já pode entrar escolhendo a oficina "${o.nome}" no login.`);
          carregar();
        }} />
    </div>
  );
}
