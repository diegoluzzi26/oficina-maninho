import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alerta, Campo, Modal, Skeleton, Spinner, Vazio } from '../components/ui';

const ROTULO_ESCOPO = { oficina: 'Oficina', pessoal: 'Pessoal', ambos: 'Ambos' };
const CORES_SUGERIDAS = [
  '#2B3D8F', '#7c3aed', '#0891b2', '#ea580c', '#D4A843',
  '#dc2626', '#65a30d', '#db2777', '#0d9488', '#64748b',
];

/**
 * CRUD de categorias de despesa. Lista todas (inclui inativas), com
 * filtro por escopo. Criar/editar/desativar via modal. Desativar é
 * soft-delete: mantém o histórico das despesas que já usam a categoria.
 */
function CategoriasDespesa() {
  const [categorias, setCategorias] = useState(null);
  const [filtroEscopo, setFiltroEscopo] = useState(''); // '', 'oficina', 'pessoal'
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  function carregar() {
    setErro('');
    api.categorias({ incluir_inativas: true })
      .then(setCategorias)
      .catch((e) => setErro(e.message));
  }
  useEffect(() => { carregar(); }, []);

  async function excluir(cat) {
    if (!confirm(`Excluir a categoria "${cat.nome}"? As despesas que já a usam ficam sem categoria, mas continuam no histórico.`)) return;
    try {
      await api.excluirCategoria(cat.id);
      setOk(`Categoria "${cat.nome}" excluída.`);
      carregar();
    } catch (err) { setErro(err.message); }
  }

  function abrirNovo() { setEditando(null); setModalAberto(true); }
  function abrirEdicao(c) { setEditando(c); setModalAberto(true); }
  function fechou(salvo) {
    setModalAberto(false);
    if (salvo) { setOk('Categoria salva.'); carregar(); }
  }

  const filtradas = (categorias || []).filter((c) => {
    if (!filtroEscopo) return true;
    return c.escopo === filtroEscopo || c.escopo === 'ambos';
  });

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="titulo-secao">Categorias de despesa</h2>
          <p className="mt-1 text-xs text-slate-500">
            Organize as despesas em categorias próprias. Cada categoria pode ser
            só da <b>oficina</b>, só <b>pessoal</b>, ou <b>ambas</b> — controlando
            o que aparece em cada tela de despesa.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={abrirNovo}>
          + Nova categoria
        </button>
      </div>

      <div className="mt-4 flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm w-fit">
        {[['', 'Todas'], ['oficina', 'Oficina'], ['pessoal', 'Pessoal']].map(([k, t]) => (
          <button key={k || 'all'} type="button" onClick={() => setFiltroEscopo(k)}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition
              ${filtroEscopo === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t}
          </button>
        ))}
      </div>

      {erro && <div className="mt-3"><Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta></div>}
      {ok   && <div className="mt-3"><Alerta tipo="ok"   onFechar={() => setOk('')}>{ok}</Alerta></div>}

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        {!categorias ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : filtradas.length === 0 ? (
          <Vazio titulo="Nenhuma categoria" descricao="Clique em '+ Nova categoria' pra criar a primeira." />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="th w-10"></th>
                <th className="th">Nome</th>
                <th className="th w-32">Escopo</th>
                <th className="th w-20 text-right">Ordem</th>
                <th className="th w-40 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.map((c) => (
                <tr key={c.id}>
                  <td className="td">
                    <span className="inline-block h-4 w-4 rounded-full ring-1 ring-slate-200"
                      style={{ background: c.cor }} title={c.cor} />
                  </td>
                  <td className="td font-medium text-slate-800">{c.nome}</td>
                  <td className="td text-xs">
                    <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset
                      ${c.escopo === 'oficina' ? 'bg-maninho-50 text-maninho-800 ring-maninho-200'
                        : c.escopo === 'pessoal' ? 'bg-violet-50 text-violet-800 ring-violet-200'
                          : 'bg-slate-50 text-slate-700 ring-slate-200'}`}>
                      {ROTULO_ESCOPO[c.escopo] || c.escopo}
                    </span>
                  </td>
                  <td className="td tnum text-right text-xs text-slate-500">{c.ordem}</td>
                  <td className="td text-right">
                    <button type="button" className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => abrirEdicao(c)}>Editar</button>
                    <button type="button"
                      className="ml-1 rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      onClick={() => excluir(c)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FormCategoria aberto={modalAberto} categoria={editando}
        onFechar={() => setModalAberto(false)} onSalvo={() => fechou(true)} />
    </div>
  );
}

function FormCategoria({ aberto, categoria, onFechar, onSalvo }) {
  const vazio = { nome: '', cor: '#64748b', escopo: 'ambos', ordem: 100 };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setErro('');
    setForm(categoria
      ? { nome: categoria.nome, cor: categoria.cor, escopo: categoria.escopo, ordem: categoria.ordem }
      : vazio);
  }, [categoria, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      const body = {
        nome: form.nome.trim(),
        cor: form.cor,
        escopo: form.escopo,
        ordem: Number(form.ordem) || 100,
      };
      if (categoria) await api.atualizarCategoria(categoria.id, body);
      else await api.criarCategoria(body);
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar}
      titulo={categoria ? `Editar categoria "${categoria.nome}"` : 'Nova categoria'}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')}
            required autoFocus minLength={2} placeholder="Ex.: Supermercado" />
        </Campo>

        <Campo label="Onde aparece" obrigatorio
          ajuda="Escolha onde essa categoria vai poder ser usada. 'Ambos' mostra nos dois lados.">
          <select className="input" value={form.escopo} onChange={set('escopo')}>
            <option value="oficina">Só na oficina</option>
            <option value="pessoal">Só nas despesas pessoais</option>
            <option value="ambos">Ambos (oficina e pessoal)</option>
          </select>
        </Campo>

        <Campo label="Cor" ajuda="Usada nos gráficos e badges. Escolha uma das sugestões ou digite hex.">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {CORES_SUGERIDAS.map((c) => (
                <button type="button" key={c}
                  onClick={() => setForm((f) => ({ ...f, cor: c }))}
                  className={`h-7 w-7 rounded-full ring-2 transition
                    ${form.cor === c ? 'ring-slate-800' : 'ring-transparent hover:ring-slate-400'}`}
                  style={{ background: c }} title={c} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input className="input font-mono text-sm w-32"
                value={form.cor} onChange={set('cor')}
                pattern="^#[0-9a-fA-F]{6}$" placeholder="#2B3D8F" />
              <span className="inline-block h-8 w-8 rounded ring-1 ring-slate-200"
                style={{ background: form.cor }} />
            </div>
          </div>
        </Campo>

        <Campo label="Ordem" ajuda="Menor = aparece primeiro nas listas. Default 100.">
          <input type="number" className="input tnum w-32" min="0" max="9999"
            value={form.ordem} onChange={set('ordem')} />
        </Campo>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : (categoria ? 'Salvar alterações' : 'Criar categoria')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Etapas do Kanban de OS
// ---------------------------------------------------------------------
const STATUS_ETAPA = [
  { valor: '', rotulo: '— nenhum (só move o card) —' },
  { valor: 'aberta', rotulo: 'Aberta' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'finalizada', rotulo: 'Finalizada' },
  { valor: 'paga', rotulo: 'Paga' },
];
const rotuloStatus = (v) => (STATUS_ETAPA.find((s) => s.valor === (v || ''))?.rotulo) || v;

/**
 * CRUD das colunas do Kanban de OS. Cada etapa pode mapear (opcional) um
 * status financeiro: aí arrastar a OS pra ela dispara o fluxo (finalizar,
 * dar baixa). Reordenar muda a ordem das colunas no quadro.
 */
function EtapasKanban() {
  const [etapas, setEtapas] = useState(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [regrasDe, setRegrasDe] = useState(null); // etapa cujas automações estão abertas

  function carregar() {
    setErro('');
    api.etapas().then(setEtapas).catch((e) => setErro(e.message));
  }
  useEffect(() => { carregar(); }, []);

  async function mover(idx, delta) {
    const nova = [...etapas];
    const alvo = idx + delta;
    if (alvo < 0 || alvo >= nova.length) return;
    [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
    setEtapas(nova); // otimista
    try { await api.reordenarEtapas(nova.map((e) => e.id)); }
    catch (err) { setErro(err.message); carregar(); }
  }

  async function excluir(etapa) {
    if (!confirm(`Remover a coluna "${etapa.nome}"? As OS precisam estar em outra coluna antes.`)) return;
    try {
      await api.removerEtapa(etapa.id);
      setOk(`Coluna "${etapa.nome}" removida.`);
      carregar();
    } catch (err) { setErro(err.message); }
  }

  function fechou(salvo) {
    setModalAberto(false);
    if (salvo) { setOk('Etapa salva.'); carregar(); }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="titulo-secao">Etapas do Kanban</h2>
          <p className="mt-1 text-xs text-slate-500">
            As colunas do quadro de ordens. Crie etapas próprias (ex.:
            <b> Aguardando peça</b>, <b>Em teste</b>). Se a etapa apontar pra um
            status, arrastar a OS pra ela já <b>finaliza</b> ou <b>dá baixa</b>.
          </p>
        </div>
        <button type="button" className="btn-primary"
          onClick={() => { setEditando(null); setModalAberto(true); }}>
          + Nova etapa
        </button>
      </div>

      {erro && <div className="mt-3"><Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta></div>}
      {ok   && <div className="mt-3"><Alerta tipo="ok"   onFechar={() => setOk('')}>{ok}</Alerta></div>}

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        {!etapas ? (
          <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : etapas.length === 0 ? (
          <Vazio titulo="Nenhuma etapa" descricao="Crie a primeira coluna do Kanban." />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="th w-20">Ordem</th>
                <th className="th w-10"></th>
                <th className="th">Nome</th>
                <th className="th w-40">Muda status para</th>
                <th className="th w-40 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {etapas.map((e, idx) => (
                <tr key={e.id}>
                  <td className="td">
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={idx === 0} onClick={() => mover(idx, -1)}
                        className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:text-slate-300">↑</button>
                      <button type="button" disabled={idx === etapas.length - 1} onClick={() => mover(idx, 1)}
                        className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:text-slate-300">↓</button>
                    </div>
                  </td>
                  <td className="td">
                    <span className="inline-block h-4 w-4 rounded ring-1 ring-slate-200"
                      style={{ background: e.cor || '#cbd5e1' }} title={e.cor} />
                  </td>
                  <td className="td font-medium text-slate-800">{e.nome}</td>
                  <td className="td text-xs text-slate-600">
                    {e.status_ao_entrar
                      ? <span className="inline-flex rounded-full bg-maninho-50 px-2 py-0.5 font-semibold text-maninho-800 ring-1 ring-inset ring-maninho-200">
                          {rotuloStatus(e.status_ao_entrar)}
                        </span>
                      : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="td text-right">
                    <button type="button" className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => setRegrasDe(e)} title="Automações ao entrar nesta etapa">⚙ Automações</button>
                    <button type="button" className="ml-1 btn-ghost px-2 py-1 text-xs"
                      onClick={() => { setEditando(e); setModalAberto(true); }}>Editar</button>
                    <button type="button"
                      className="ml-1 rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      onClick={() => excluir(e)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FormEtapa aberto={modalAberto} etapa={editando}
        onFechar={() => setModalAberto(false)} onSalvo={() => fechou(true)} />

      <RegrasEtapaModal etapa={regrasDe} onFechar={() => setRegrasDe(null)} />
    </div>
  );
}

const ACOES_REGRA = [
  { valor: 'criar_retorno', rotulo: 'Agendar um retorno/lembrete' },
  { valor: 'enfileirar_followup', rotulo: 'Enfileirar follow-up (fica pendente)' },
];
const TIPOS_FOLLOWUP = [
  { valor: 'manutencao', rotulo: 'Manutenção' },
  { valor: 'reativacao', rotulo: 'Reativação' },
  { valor: 'promocao', rotulo: 'Promoção' },
];

function descreveRegra(r) {
  const p = r.params || {};
  if (r.acao === 'criar_retorno') {
    return `Agendar retorno em ${Number(p.dias) || 0} dia(s)${p.motivo ? ` — "${p.motivo}"` : ''}`;
  }
  if (r.acao === 'enfileirar_followup') {
    const tipo = TIPOS_FOLLOWUP.find((t) => t.valor === p.tipo)?.rotulo || p.tipo || 'manutenção';
    return `Follow-up (${tipo}) em ${Number(p.dias) || 0} dia(s), pendente pra envio manual`;
  }
  return r.acao;
}

/**
 * Automações de uma etapa: "ao entrar aqui, faça X". Nenhuma envia
 * WhatsApp sozinha — o follow-up entra como pendente.
 */
function RegrasEtapaModal({ etapa, onFechar }) {
  const [regras, setRegras] = useState(null);
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState({ acao: 'criar_retorno', dias: 7, motivo: '', tipo: 'manutencao', mensagem: '' });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!etapa) { setRegras(null); return; }
    setErro('');
    api.regrasEtapa(etapa.id).then(setRegras).catch((e) => setErro(e.message));
  }, [etapa?.id]);

  if (!etapa) return null;

  async function adicionar() {
    setSalvando(true); setErro('');
    try {
      const params = nova.acao === 'criar_retorno'
        ? { dias: Number(nova.dias) || 0, motivo: nova.motivo || undefined }
        : { tipo: nova.tipo, dias: Number(nova.dias) || 0, mensagem: nova.mensagem || undefined };
      await api.criarRegraEtapa(etapa.id, { acao: nova.acao, params });
      setNova({ acao: 'criar_retorno', dias: 7, motivo: '', tipo: 'manutencao', mensagem: '' });
      setRegras(await api.regrasEtapa(etapa.id));
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  async function remover(id) {
    setErro('');
    try {
      await api.removerRegraEtapa(etapa.id, id);
      setRegras((rs) => rs.filter((r) => r.id !== id));
    } catch (e) { setErro(e.message); }
  }

  return (
    <Modal aberto={!!etapa} onFechar={onFechar} titulo={`Automações — "${etapa.nome}"`} largura="max-w-lg">
      <div className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        <p className="text-xs text-slate-500">
          Estas ações rodam quando uma OS é arrastada pra esta etapa. Nada é enviado
          por WhatsApp automaticamente — o follow-up fica <b>pendente</b> pra você enviar.
        </p>

        {!regras ? (
          <Skeleton className="h-16" />
        ) : regras.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">
            Nenhuma automação nesta etapa ainda.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {regras.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 text-slate-700">{descreveRegra(r)}</span>
                <button type="button" onClick={() => remover(r.id)}
                  className="rounded px-1.5 text-xs text-rose-600 hover:bg-rose-50" title="Remover">✕</button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 rounded-md bg-slate-50 p-3">
          <p className="label">Nova automação</p>
          <select className="input" value={nova.acao}
            onChange={(e) => setNova((n) => ({ ...n, acao: e.target.value }))}>
            {ACOES_REGRA.map((a) => <option key={a.valor} value={a.valor}>{a.rotulo}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Daqui a</span>
            <input type="number" min="0" max="365" className="input tnum w-20 py-1.5 text-sm"
              value={nova.dias} onChange={(e) => setNova((n) => ({ ...n, dias: e.target.value }))} />
            <span className="text-xs text-slate-500">dia(s)</span>
          </div>

          {nova.acao === 'criar_retorno' ? (
            <input className="input py-1.5 text-sm" placeholder="Motivo (opcional)"
              value={nova.motivo} onChange={(e) => setNova((n) => ({ ...n, motivo: e.target.value }))} />
          ) : (
            <>
              <select className="input py-1.5 text-sm" value={nova.tipo}
                onChange={(e) => setNova((n) => ({ ...n, tipo: e.target.value }))}>
                {TIPOS_FOLLOWUP.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
              <textarea className="input py-1.5 text-sm" rows={2} placeholder="Mensagem do follow-up (opcional)"
                value={nova.mensagem} onChange={(e) => setNova((n) => ({ ...n, mensagem: e.target.value }))} />
            </>
          )}

          <div className="flex justify-end">
            <button type="button" className="btn-primary px-3 py-1.5 text-xs"
              onClick={adicionar} disabled={salvando}>
              {salvando ? <><Spinner className="h-4 w-4" /> Adicionando…</> : '+ Adicionar automação'}
            </button>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </Modal>
  );
}

function FormEtapa({ aberto, etapa, onFechar, onSalvo }) {
  const vazio = { nome: '', cor: '#64748b', status_ao_entrar: '' };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setErro('');
    setForm(etapa
      ? { nome: etapa.nome, cor: etapa.cor || '#64748b', status_ao_entrar: etapa.status_ao_entrar || '' }
      : vazio);
  }, [etapa, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      const body = { nome: form.nome.trim(), cor: form.cor, status_ao_entrar: form.status_ao_entrar || null };
      if (etapa) await api.atualizarEtapa(etapa.id, body);
      else await api.criarEtapa(body);
      onSalvo();
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar}
      titulo={etapa ? `Editar etapa "${etapa.nome}"` : 'Nova etapa'}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')}
            required autoFocus minLength={1} maxLength={40} placeholder="Ex.: Aguardando peça" />
        </Campo>

        <Campo label="Muda o status para"
          ajuda="Ao arrastar uma OS pra esta coluna. 'Finalizada' e 'Paga' pedem confirmação. Deixe em 'nenhum' pra só mover o card.">
          <select className="input" value={form.status_ao_entrar} onChange={set('status_ao_entrar')}>
            {STATUS_ETAPA.map((s) => (
              <option key={s.valor || 'none'} value={s.valor}>{s.rotulo}</option>
            ))}
          </select>
        </Campo>

        <Campo label="Cor" ajuda="Faixa colorida no topo da coluna.">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {CORES_SUGERIDAS.map((c) => (
                <button type="button" key={c} onClick={() => setForm((f) => ({ ...f, cor: c }))}
                  className={`h-7 w-7 rounded-full ring-2 transition
                    ${form.cor === c ? 'ring-slate-800' : 'ring-transparent hover:ring-slate-400'}`}
                  style={{ background: c }} title={c} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input className="input font-mono text-sm w-32" value={form.cor} onChange={set('cor')}
                pattern="^#[0-9a-fA-F]{6}$" placeholder="#2B3D8F" />
              <span className="inline-block h-8 w-8 rounded ring-1 ring-slate-200"
                style={{ background: form.cor }} />
            </div>
          </div>
        </Campo>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : (etapa ? 'Salvar alterações' : 'Criar etapa')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Configurações do sistema — WhatsApp (Evolution API) + Meta mensal.
 * Só admin acessa (backend recusa com 403 pra não-admin; menu esconde).
 *
 * API key da Evolution vem mascarada do backend. Botão "Trocar"
 * destrava edição pra evitar sobrescrever por acidente.
 */

function CampoSecreto({ label, valorMascarado, valor, onChange, obrigatorio, ajuda }) {
  const [editando, setEditando] = useState(false);
  return (
    <Campo label={label} obrigatorio={obrigatorio} ajuda={ajuda}>
      <div className="flex gap-2">
        <input
          type={editando ? 'text' : 'password'}
          className="input flex-1 font-mono text-sm"
          placeholder={valorMascarado || '(não configurado)'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={!editando}
        />
        <button type="button" onClick={() => setEditando((v) => !v)}
          className="btn-ghost px-3 text-xs">
          {editando ? 'Cancelar' : (valorMascarado ? 'Trocar' : 'Definir')}
        </button>
      </div>
      {valorMascarado && !editando && (
        <p className="mt-1 text-[11px] text-slate-500">
          Guardado: <span className="font-mono">{valorMascarado}</span>. Clique em Trocar pra substituir.
        </p>
      )}
    </Campo>
  );
}

/** Bloco de conexão WhatsApp — status + QR code inline */
function BlocoConexao({ enabled }) {
  const [estado, setEstado] = useState(null);
  const [qr, setQr] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  async function ver() {
    setCarregando(true); setErro('');
    try {
      const e = await api.waConexao();
      setEstado(e);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }
  async function pegarQr() {
    setCarregando(true); setErro(''); setQr(null);
    try {
      const r = await api.waQrCode();
      setQr(r);
      const e = await api.waConexao();
      setEstado(e);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }
  async function desconectar() {
    if (!confirm('Desconectar o WhatsApp? Vai precisar escanear o QR de novo.')) return;
    setCarregando(true); setErro('');
    try {
      await api.waDesconectar();
      setQr(null);
      await ver();
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { if (enabled) ver(); }, [enabled]);

  // Auto-refresh a cada 4s enquanto tem QR na tela — assim que conectar, atualiza
  useEffect(() => {
    if (!qr || !enabled) return;
    const t = setInterval(async () => {
      try {
        const e = await api.waConexao();
        setEstado(e);
        if (e.conectado) { setQr(null); }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [qr, enabled]);

  if (!enabled) {
    return (
      <p className="text-xs text-slate-500">
        Preencha e salve URL, API key e nome da instância antes de conectar o WhatsApp.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {/* Status atual */}
      <div className="flex flex-wrap items-center gap-3">
        {estado ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold
            ${estado.conectado ? 'bg-emerald-100 text-emerald-800'
              : estado.estado === 'connecting' ? 'bg-ouro-100 text-ouro-800'
              : 'bg-slate-100 text-slate-700'}`}>
            {estado.conectado ? '✓ Conectado' : `Estado: ${estado.estado || 'desconhecido'}`}
          </span>
        ) : (
          <span className="text-xs text-slate-500">Verificando…</span>
        )}
        <button onClick={ver} disabled={carregando}
          className="btn-ghost px-3 py-1 text-xs">↻ Atualizar</button>
        {estado?.conectado ? (
          <button onClick={desconectar} disabled={carregando}
            className="rounded bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">
            Desconectar
          </button>
        ) : (
          <button onClick={pegarQr} disabled={carregando}
            className="btn-primary px-3 py-1 text-xs">
            {carregando ? '…' : (qr ? '↻ Gerar novo QR' : '📱 Conectar WhatsApp')}
          </button>
        )}
      </div>

      {qr && !estado?.conectado && (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm text-slate-700">
            Abra o WhatsApp no celular → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>,
            e escaneie o código abaixo.
          </p>
          <div className="flex justify-center">
            {qr.base64 ? (
              <img src={qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`}
                alt="QR code do WhatsApp"
                className="h-64 w-64 rounded-md border border-slate-300" />
            ) : (
              <p className="text-sm text-rose-700">QR code não veio na resposta.</p>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-500">
            A tela atualiza sozinha a cada 4s. Assim que conectar, o QR some.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Configuracoes() {
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState({ setup: {}, alerta: {}, meta: {} });
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregar(); }, []);

  function carregar() {
    setErro('');
    api.configWhatsApp()
      .then((d) => {
        setDados(d);
        setForm({ setup: {}, alerta: {}, meta: {} });
      })
      .catch((e) => setErro(e.message));
  }

  const set = (grupo, campo) => (v) =>
    setForm((f) => ({ ...f, [grupo]: { ...f[grupo], [campo]: v } }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro(''); setOk('');
    const body = {
      setup: { ...form.setup },
      alerta: { ...form.alerta },
      meta: { ...form.meta },
    };
    // api_key vazia = "não mexer" (não zera segredo por acidente)
    if (body.setup.api_key === '') delete body.setup.api_key;
    try {
      const atualizado = await api.salvarConfigWhatsApp(body);
      setDados(atualizado);
      setForm({ setup: {}, alerta: {}, meta: {} });
      setOk('Configurações salvas.');
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!dados) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  const v = (grupo, campo) =>
    form[grupo][campo] !== undefined ? form[grupo][campo] : (dados[grupo][campo] ?? '');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
          Configurações
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Ajuste WhatsApp (Evolution API), meta mensal e alertas internos.
        </p>
      </div>

      {/* Status geral */}
      <div className={`card p-4 border-l-4 ${dados.enabled ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
        <p className="font-display text-sm font-semibold uppercase tracking-wide">
          Status:{' '}
          {dados.enabled
            ? <span className="text-emerald-700">Evolution API configurada</span>
            : <span className="text-rose-700">WhatsApp NÃO configurado</span>}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Configurada não significa <b>conectada</b>. Depois de salvar URL + API key + instância,
          use o botão <b>Conectar WhatsApp</b> abaixo pra escanear o QR code no celular.
          Sem conexão ativa, todo envio falha silenciosamente.
        </p>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {ok   && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}

      <form onSubmit={salvar} className="space-y-5">
        {/* Setup Evolution */}
        <div className="card p-5">
          <h2 className="titulo-secao">Evolution API</h2>
          <p className="mb-4 text-xs text-slate-500">
            Provider self-hosted que substitui a Meta Cloud API — sem templates,
            sem janela de 24h, sem custo por mensagem. Se você está rodando pelo
            docker-compose deste projeto, os defaults abaixo já funcionam.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="URL da Evolution" obrigatorio
              ajuda="Dentro do compose = http://evolution:8080">
              <input className="input font-mono text-sm"
                value={v('setup', 'url')}
                onChange={(e) => set('setup', 'url')(e.target.value)}
                placeholder="http://evolution:8080" />
            </Campo>

            <Campo label="Nome da instância" obrigatorio
              ajuda="Aparece como 'aparelho conectado' no WhatsApp">
              <input className="input"
                value={v('setup', 'instance')}
                onChange={(e) => set('setup', 'instance')(e.target.value)}
                placeholder="oficina" />
            </Campo>

            <div className="sm:col-span-2">
              <CampoSecreto label="API key" obrigatorio
                valorMascarado={dados.setup.api_key}
                valor={form.setup.api_key ?? ''}
                onChange={set('setup', 'api_key')}
                ajuda="Chave global do Evolution (a mesma que está em EVOLUTION_API_KEY no .env)" />
            </div>
          </div>
        </div>

        {/* Alertas internos */}
        <div className="card p-5">
          <h2 className="titulo-secao">Alertas internos (dono da oficina)</h2>
          <p className="mb-4 text-xs text-slate-500">
            Onde e quando você recebe os avisos de contas a pagar. Este número
            NÃO é o da oficina — é o SEU celular pessoal.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Meu WhatsApp (E.164)"
              ajuda="Ex.: +5551998887777">
              <input className="input font-mono"
                value={v('alerta', 'whatsapp')}
                onChange={(e) => set('alerta', 'whatsapp')(e.target.value)}
                placeholder="+5551999999999" />
            </Campo>
            <Campo label="Hora do envio diário"
              ajuda="Hora do dia (0–23) em que o resumo é enviado.">
              <input type="number" min="0" max="23" className="input"
                value={v('alerta', 'hora')}
                onChange={(e) => set('alerta', 'hora')(e.target.value)}
                placeholder="8" />
            </Campo>
          </div>
        </div>

        {/* Meta mensal */}
        <div className="card p-5">
          <h2 className="titulo-secao">Meta de faturamento mensal</h2>
          <p className="mb-4 text-xs text-slate-500">
            Aparece no Painel como barra de progresso com projeção do fechamento.
            Deixe vazio pra esconder o bloco.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Meta mensal (R$)" ajuda="Ex.: 20000 = R$ 20.000">
              <input type="number" min="0" step="100" className="input tnum"
                value={v('meta', 'mensal')}
                onChange={(e) => set('meta', 'mensal')(e.target.value)}
                placeholder="20000" />
            </Campo>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={carregar}>
            Descartar alterações
          </button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Salvar configurações'}
          </button>
        </div>
      </form>

      {/* Categorias de despesa — fora do formulário, tem CRUD próprio */}
      <CategoriasDespesa />

      {/* Etapas do Kanban de OS — CRUD próprio */}
      <EtapasKanban />

      {/* Conexão do WhatsApp — fora do formulário porque não faz save */}
      <div className="card p-5">
        <h2 className="titulo-secao">Conexão do WhatsApp</h2>
        <p className="mb-4 text-xs text-slate-500">
          Depois de salvar as credenciais acima, conecte o número da oficina
          escaneando o QR code com o celular.
        </p>
        <BlocoConexao enabled={dados.enabled} />
      </div>
    </div>
  );
}
