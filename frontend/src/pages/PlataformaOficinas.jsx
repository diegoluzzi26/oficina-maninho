import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

function dataBR(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

const ASSIN_BADGE = {
  ativa:        'bg-emerald-100 text-emerald-800',
  trial:        'bg-sky-100 text-sky-800',
  inadimplente: 'bg-rose-100 text-rose-800',
  cancelada:    'bg-slate-200 text-slate-700',
};
const ASSIN_LABEL = {
  ativa: 'Ativa', trial: 'Trial', inadimplente: 'Inadimplente', cancelada: 'Cancelada',
};

function AssinaturaBadge({ status }) {
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ASSIN_BADGE[status] || 'bg-slate-100 text-slate-600'}`}>
      {ASSIN_LABEL[status] || status || '—'}
    </span>
  );
}

function FormAssinatura({ oficina, onFechar, onSalvo }) {
  const [form, setForm] = useState({
    assinatura_status: oficina.assinatura_status || 'trial',
    trial_fim: oficina.trial_fim || '',
    proximo_vencimento: oficina.proximo_vencimento || '',
    graca_dias: oficina.graca_dias ?? 5,
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      await onSalvo({
        assinatura_status: form.assinatura_status,
        trial_fim: form.trial_fim || null,
        proximo_vencimento: form.proximo_vencimento || null,
        graca_dias: Number(form.graca_dias),
      });
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto largura="max-w-md" titulo={`Assinatura · ${oficina.nome}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        <Campo label="Status" obrigatorio>
          <select className="input" value={form.assinatura_status} onChange={set('assinatura_status')}>
            <option value="trial">Trial (período de teste)</option>
            <option value="ativa">Ativa (pagando)</option>
            <option value="inadimplente">Inadimplente (pagamento pendente)</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Fim do trial" ajuda="Usado quando status = trial">
            <input type="date" className="input" value={form.trial_fim} onChange={set('trial_fim')} />
          </Campo>
          <Campo label="Próximo vencimento" ajuda="Usado quando inadimplente/ativa">
            <input type="date" className="input" value={form.proximo_vencimento} onChange={set('proximo_vencimento')} />
          </Campo>
        </div>
        <Campo label="Dias de graça" ajuda="Tolerância após vencer antes de bloquear">
          <input type="number" min="0" max="90" className="input w-28" value={form.graca_dias} onChange={set('graca_dias')} />
        </Campo>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
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
  const [editandoAssin, setEditandoAssin] = useState(null);
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
                <th className="px-4 py-2">Assinatura</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {oficinas.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-2 font-semibold text-slate-800">{o.nome}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">{o.slug}</td>
                  <td className="px-4 py-2 tnum">{o.usuarios}</td>
                  <td className="px-4 py-2 text-slate-600">{dataBR(o.criado_em)}</td>
                  <td className="px-4 py-2"><AssinaturaBadge status={o.assinatura_status} /></td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => { setOk(''); setEditandoAssin(o); }}
                      className="rounded px-2 py-1 text-xs font-semibold text-maninho-600 hover:bg-maninho-50">
                      Assinatura
                    </button>
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
          setOk(`Oficina "${o.nome}" criada (em trial de 14 dias). O admin já pode entrar escolhendo a oficina "${o.nome}" no login.`);
          carregar();
        }} />

      {editandoAssin && (
        <FormAssinatura oficina={editandoAssin}
          onFechar={() => setEditandoAssin(null)}
          onSalvo={async (body) => {
            await api.adminAtualizarAssinatura(editandoAssin.id, body);
            setEditandoAssin(null);
            setOk(`Assinatura de "${editandoAssin.nome}" atualizada.`);
            carregar();
          }} />
      )}
    </div>
  );
}
