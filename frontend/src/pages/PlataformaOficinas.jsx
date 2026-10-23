import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { api } from '../lib/api';
import { brl, dataHora, semanaCurta } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

function dataBR(iso) {
  if (!iso) return '—';
  // Datas puras (YYYY-MM-DD) sem fuso: senão o dia volta um no Brasil.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split('-').reverse().join('/');
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** Cartão de número do topo do painel. */
function Numero({ titulo, valor, detalhe, destaque }) {
  return (
    <div className={`card p-4 ${destaque ? 'border-maninho-300 bg-maninho-50/50' : ''}`}>
      <p className="label">{titulo}</p>
      <p className="mt-1 font-display text-[26px] font-semibold leading-tight text-slate-800 tnum">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

/** Resumo da plataforma: receita, oficinas em teste, acessos e visitas do site. */
function Resumo({ resumo }) {
  if (!resumo) {
    return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  }
  const { oficinas: o, receita, acessos, visitas_site: v } = resumo;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero destaque titulo="Receita mensal" valor={brl(receita.mensal)}
          detalhe={`${o.ativas} oficina(s) pagando`} />
        <Numero titulo="Em período de teste" valor={o.trial}
          detalhe={o.trial_vencendo
            ? `${o.trial_vencendo} terminam em até 7 dias · ${brl(receita.potencial_trial)}/mês se fecharem`
            : `${brl(receita.potencial_trial)}/mês se todas fecharem`} />
        <Numero titulo="Pagamento atrasado" valor={o.inadimplentes}
          detalhe={o.inadimplentes ? `${brl(receita.em_atraso)} em aberto` : 'Ninguém atrasado'} />
        <Numero titulo="Oficinas" valor={o.total}
          detalhe={`${o.canceladas} cancelada(s)`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr]">
        <Numero titulo="Acessos ao sistema" valor={acessos.ultimos_30d}
          detalhe={`logins nos últimos 30 dias · ${acessos.hoje} hoje`} />
        <Numero titulo="Visitas no site" valor={v.ultimos_30d}
          detalhe={`últimos 30 dias · ${v.hoje} hoje`} />
        <div className="card p-4">
          <p className="label">Visitas no site por dia</p>
          <div className="mt-2 h-[72px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={v.por_dia} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="dia" hide />
                <Tooltip cursor={{ fill: 'rgba(15,46,77,.06)' }}
                  labelFormatter={(d) => semanaCurta(d)}
                  formatter={(n) => [n, 'visitas']} />
                <Bar dataKey="total" fill="#f97316" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Situação da cobrança em texto curto: dias de teste, vencimento, atraso. */
function Situacao({ o }) {
  const a = o.avaliacao || {};
  if (a.bloqueada) return <span className="text-rose-600">Bloqueada · {a.motivo}</span>;
  if (o.assinatura_status === 'trial') {
    if (a.em_graca) return <span className="text-ouro-700">Teste acabou · {a.dias_restantes} dia(s) de graça</span>;
    if (a.dias_restantes != null) return <span>Teste até {dataBR(o.trial_fim)} · faltam {a.dias_restantes} dia(s)</span>;
    return <span>Em teste</span>;
  }
  if (o.assinatura_status === 'inadimplente') {
    return (
      <span className="text-rose-600">
        Venceu {dataBR(o.proximo_vencimento)}
        {a.dias_restantes != null && ` · ${a.dias_restantes} dia(s) até bloquear`}
      </span>
    );
  }
  if (o.assinatura_status === 'ativa') {
    return <span>Próx. cobrança {dataBR(o.proximo_vencimento)}</span>;
  }
  return <span className="text-slate-500">—</span>;
}

const ASSIN_BADGE = {
  ativa:        'bg-emerald-100 text-emerald-800',
  trial:        'bg-sky-100 text-sky-800',
  inadimplente: 'bg-rose-100 text-rose-800',
  cancelada:    'bg-slate-200 text-slate-700',
};
const ASSIN_LABEL = {
  ativa: 'Ativa', trial: 'Em teste', inadimplente: 'Inadimplente', cancelada: 'Cancelada',
};
// Mesmas chaves de src/config/planos.js.
const PLANO_LABEL = {
  essencial: 'Essencial', profissional: 'Profissional', completo: 'Completo',
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
    plano: oficina.plano || 'profissional',
    ciclo: oficina.ciclo || 'mensal',
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
        plano: form.plano,
        ciclo: form.ciclo,
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
          <Campo label="Plano" obrigatorio>
            <select className="input" value={form.plano} onChange={set('plano')}>
              {Object.entries(PLANO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          <Campo label="Cobrança" obrigatorio>
            <select className="input" value={form.ciclo} onChange={set('ciclo')}>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual (2 meses grátis)</option>
            </select>
          </Campo>
        </div>
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

function FormContrato({ onFechar, onPublicado }) {
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState({ titulo: '', texto: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.adminContratos().then((d) => {
      setDados(d);
      setForm({ titulo: d.atual?.titulo || 'Termos de Uso', texto: d.atual?.texto || '' });
    }).catch((e) => setErro(e.message));
  }, []);

  async function publicar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      await api.adminPublicarContrato({ titulo: form.titulo.trim(), texto: form.texto.trim() });
      onPublicado();
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto largura="max-w-2xl" titulo="Contrato / Termos de uso" onFechar={onFechar}>
      <form onSubmit={publicar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        <p className="text-xs text-slate-500">
          Versão vigente: <strong>v{dados?.atual?.versao ?? '—'}</strong>. Publicar uma
          versão nova <strong>obriga todas as oficinas a aceitarem de novo</strong>.
        </p>
        <Campo label="Título" obrigatorio>
          <input className="input" value={form.titulo}
            onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} required maxLength={160} />
        </Campo>
        <Campo label="Texto do contrato" obrigatorio>
          <textarea className="input min-h-[280px] resize-y font-mono text-xs" value={form.texto}
            onChange={(e) => setForm((f) => ({ ...f, texto: e.target.value }))} required />
        </Campo>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Publicando…</> : 'Publicar nova versão'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PlataformaOficinas() {
  const [oficinas, setOficinas] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editandoAssin, setEditandoAssin] = useState(null);
  const [contratoAberto, setContratoAberto] = useState(false);
  const [ok, setOk] = useState('');

  function carregar() {
    setErro('');
    api.adminOficinas().then(setOficinas).catch((e) => setErro(e.message));
    api.adminResumo().then(setResumo).catch((e) => setErro(e.message));
  }
  useEffect(carregar, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Plataforma
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Como estão as oficinas: pagamento, período de teste e uso do sistema.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setContratoAberto(true)}>
            Termos de uso
          </button>
          <button className="btn-primary" onClick={() => { setOk(''); setAberto(true); }}>
            + Nova oficina
          </button>
        </div>
      </div>

      {ok && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      <Resumo resumo={resumo} />

      {!oficinas ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : oficinas.length === 0 ? (
        <Vazio titulo="Nenhuma oficina" descricao="Crie a primeira com o botão acima." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Oficina</th>
                <th className="px-4 py-2">Plano</th>
                <th className="px-4 py-2 text-right">Valor</th>
                <th className="px-4 py-2">Assinatura</th>
                <th className="px-4 py-2">Situação</th>
                <th className="px-4 py-2 text-right">Usuários</th>
                <th className="px-4 py-2 text-right" title="Logins nos últimos 30 dias">Acessos 30d</th>
                <th className="px-4 py-2">Último acesso</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {oficinas.map((o) => (
                <tr key={o.id} className="align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-800">{o.nome}</p>
                    <p className="font-mono text-[11px] text-slate-500">{o.slug} · desde {dataBR(o.criado_em)}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{PLANO_LABEL[o.plano] || '—'}</td>
                  <td className="px-4 py-2.5 text-right tnum">
                    <span className="font-semibold text-slate-800">{brl(o.valor)}</span>
                    <span className="text-xs text-slate-500">/{o.ciclo === 'anual' ? 'ano' : 'mês'}</span>
                  </td>
                  <td className="px-4 py-2.5"><AssinaturaBadge status={o.assinatura_status} /></td>
                  <td className="px-4 py-2.5 text-xs text-slate-600"><Situacao o={o} /></td>
                  <td className="px-4 py-2.5 text-right tnum">{o.usuarios_ativos}</td>
                  <td className="px-4 py-2.5 text-right tnum">
                    {o.acessos_30d}
                    <span className="block text-[11px] text-slate-400">{o.acessos_total} no total</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">
                    {o.ultimo_acesso ? dataHora(o.ultimo_acesso) : 'Nunca entrou'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
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

      {contratoAberto && (
        <FormContrato
          onFechar={() => setContratoAberto(false)}
          onPublicado={() => { setContratoAberto(false); setOk('Nova versão do contrato publicada. As oficinas vão precisar aceitar de novo.'); }} />
      )}

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
