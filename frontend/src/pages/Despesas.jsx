import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import {
  brl, data, paraInput, hojeISO, rotuloForma, FORMAS_PAGAMENTO,
  STATUS_DESPESA, textoVencimento, nomeMes,
} from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

function BadgeDespesa({ status }) {
  const s = STATUS_DESPESA[status] || STATUS_DESPESA.pendente;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px]
                      font-semibold ring-1 ring-inset ${s.classe}`}>
      {s.texto}
    </span>
  );
}

/** Destaca visualmente o que já venceu ou vence hoje. */
function Vencimento({ dias, vencimento }) {
  if (!vencimento) return <span className="text-xs text-slate-400">—</span>;
  const texto = textoVencimento(dias);
  const cor = dias < 0 ? 'text-rose-600 font-semibold'
    : dias === 0 ? 'text-ouro-700 font-semibold'
      : dias <= 3 ? 'text-ouro-600' : 'text-slate-500';
  return (
    <div>
      <p className="tnum text-sm text-slate-700">{data(vencimento)}</p>
      <p className={`text-[11px] ${cor}`}>{texto}</p>
    </div>
  );
}

function FormDespesa({ aberto, despesa, escopo = 'oficina', onFechar, onSalvo }) {
  const vazio = {
    descricao: '', categoria_id: '', fornecedor_id: '', valor: '',
    forma: 'boleto', vencimento: '', competencia: '', status: 'pendente',
    numero_doc: '', codigo_barras: '', observacoes: '',
    pago_em: '', valor_pago: '',
    escopo,
  };
  const [form, setForm] = useState(vazio);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Categorias filtram pelo escopo da despesa em edição (as opções válidas
  // mudam se o usuário troca oficina<->pessoal, então recarrega junto).
  useEffect(() => {
    if (!aberto) return;
    Promise.all([api.categorias({ escopo: form.escopo }), api.fornecedores()])
      .then(([c, f]) => { setCategorias(c); setFornecedores(f); })
      .catch((e) => setErro(e.message));
  }, [aberto, form.escopo]);

  useEffect(() => {
    setErro('');
    setForm(despesa ? {
      ...vazio,
      ...despesa,
      categoria_id: despesa.categoria_id || '',
      fornecedor_id: despesa.fornecedor_id || '',
      vencimento: paraInput(despesa.vencimento),
      competencia: paraInput(despesa.competencia),
      pago_em: paraInput(despesa.pago_em),
      valor: String(despesa.valor),
      valor_pago: despesa.valor_pago != null ? String(despesa.valor_pago) : '',
      escopo: despesa.escopo || escopo,
    } : vazio);
  }, [despesa, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const body = {
        descricao: form.descricao,
        categoria_id: form.categoria_id || null,
        fornecedor_id: form.fornecedor_id || null,
        valor: Number(form.valor),
        forma: form.forma,
        vencimento: form.vencimento || null,
        competencia: form.competencia || null,
        status: form.status,
        numero_doc: form.numero_doc || null,
        codigo_barras: form.codigo_barras || null,
        observacoes: form.observacoes || null,
        escopo: form.escopo || escopo,
      };
      if (form.status === 'paga') {
        body.pago_em = form.pago_em || null;
        body.valor_pago = form.valor_pago === '' ? null : Number(form.valor_pago);
      }
      const salvo = despesa
        ? await api.atualizarDespesa(despesa.id, body)
        : await api.criarDespesa(body);
      onSalvo(salvo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} largura="max-w-2xl" onFechar={onFechar}
      titulo={despesa ? `Editar despesa nº ${despesa.numero_despesa}` : 'Nova despesa'}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Descrição" obrigatorio>
          <input className="input" value={form.descricao} onChange={set('descricao')} required
            autoFocus placeholder="Compra de alternadores — NF 4471" />
        </Campo>

        <Campo label="Escopo" ajuda="Troque pra mover a despesa entre Oficina e Pessoal">
          <select className="input max-w-[220px]" value={form.escopo}
            onChange={(e) => setForm((f) => ({ ...f, escopo: e.target.value, categoria_id: '' }))}>
            <option value="oficina">Oficina</option>
            <option value="pessoal">Pessoal</option>
          </select>
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Valor (R$)" obrigatorio>
            <input type="number" step="0.01" min="0.01" className="input tnum" required
              value={form.valor} onChange={set('valor')} placeholder="2340.00" />
          </Campo>

          <Campo label="Forma de pagamento" obrigatorio>
            <select className="input" value={form.forma} onChange={set('forma')}>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.valor} value={f.valor}>{f.rotulo}</option>
              ))}
            </select>
          </Campo>

          <Campo label="Categoria">
            <select className="input" value={form.categoria_id} onChange={set('categoria_id')}>
              <option value="">Sem categoria</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>

          <Campo label="Fornecedor">
            <select className="input" value={form.fornecedor_id} onChange={set('fornecedor_id')}>
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>

          <Campo label="Vencimento">
            <input type="date" className="input" value={form.vencimento} onChange={set('vencimento')} />
          </Campo>

          <Campo label="Competência (mês da despesa)">
            <input type="date" className="input" value={form.competencia} onChange={set('competencia')} />
          </Campo>

          <Campo label="Nº do documento / nota">
            <input className="input" value={form.numero_doc} onChange={set('numero_doc')}
              placeholder="NF-4471" />
          </Campo>

          <Campo label="Situação">
            <select className="input" value={form.status} onChange={set('status')}>
              <option value="pendente">Pendente</option>
              <option value="paga">Paga</option>
            </select>
          </Campo>
        </div>

        {form.status === 'paga' && (
          <div className="grid gap-4 rounded-md border border-emerald-200 bg-emerald-50/40 p-3 sm:grid-cols-2">
            <Campo label="Data do pagamento">
              <input type="date" className="input" value={form.pago_em}
                onChange={set('pago_em')} />
            </Campo>
            <Campo label="Valor efetivamente pago (R$)"
              ajuda="Vazio = usa o valor lançado acima">
              <input type="number" step="0.01" min="0" className="input tnum"
                value={form.valor_pago} onChange={set('valor_pago')}
                placeholder={form.valor} />
            </Campo>
          </div>
        )}

        <Campo label="Código de barras do boleto">
          <input className="input font-mono text-xs" value={form.codigo_barras}
            onChange={set('codigo_barras')} placeholder="Opcional" />
        </Campo>

        <Campo label="Observações">
          <textarea className="input min-h-[60px] resize-y" value={form.observacoes}
            onChange={set('observacoes')} />
        </Campo>

        <p className="rounded-md bg-maninho-50 px-3 py-2 text-xs text-slate-600">
          Preencha o <strong>vencimento</strong> para a despesa aparecer na aba Boletos
          e nos avisos de vencimento. Sem vencimento, ela conta apenas nas análises do mês.
        </p>

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

function ModalPagar({ despesa, onFechar, onPago }) {
  const [pagoEm, setPagoEm] = useState(hojeISO());
  const [valorPago, setValorPago] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (despesa) { setPagoEm(hojeISO()); setValorPago(String(despesa.valor)); setErro(''); }
  }, [despesa]);

  if (!despesa) return null;

  async function pagar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const r = await api.pagarDespesa(despesa.id, {
        pago_em: pagoEm,
        valor_pago: valorPago ? Number(valorPago) : null,
      });
      onPago(r);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const diferenca = Number(valorPago || 0) - Number(despesa.valor);

  return (
    <Modal aberto titulo="Dar baixa no pagamento" onFechar={onFechar}>
      <form onSubmit={pagar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <div className="rounded-md bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">{despesa.descricao}</p>
          <p className="text-xs text-slate-500">
            {despesa.fornecedor_nome || 'Sem fornecedor'} · valor de {brl(despesa.valor)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Data do pagamento" obrigatorio>
            <input type="date" className="input" value={pagoEm} required
              onChange={(e) => setPagoEm(e.target.value)} />
          </Campo>
          <Campo label="Valor pago (R$)">
            <input type="number" step="0.01" min="0" className="input tnum" value={valorPago}
              onChange={(e) => setValorPago(e.target.value)} />
          </Campo>
        </div>

        {Math.abs(diferenca) > 0.005 && (
          <Alerta tipo="aviso">
            {diferenca > 0
              ? `Você está pagando ${brl(diferenca)} a mais que o valor lançado.`
              : `Pagamento parcial: faltam ${brl(Math.abs(diferenca))}.`}
          </Alerta>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-ouro" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Confirmar pagamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Despesas({ escopo = 'oficina' } = {}) {
  const hoje = new Date();
  const [aba, setAba] = useState('todas');
  const [lista, setLista] = useState(null);
  const [alertas, setAlertas] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [forma, setForma] = useState('');
  const [fornecedores, setFornecedores] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [ref, setRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, todos: false });
  const [erro, setErro] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [pagando, setPagando] = useState(null);

  // Carrega fornecedores e categorias pra alimentar os filtros.
  // Categorias vêm filtradas pelo escopo da aba (oficina/pessoal).
  useEffect(() => {
    api.fornecedores().then(setFornecedores).catch(() => {});
    api.categorias({ escopo }).then(setCategorias).catch(() => {});
  }, [escopo]);

  const carregar = useCallback(() => {
    setErro('');
    // 1000 é folga pra caber todo o mês/filtro sem paginar. Se um dia
    // um mês passar disso, a gente troca por scroll infinito.
    const params = { escopo, busca, status: filtroStatus || undefined, por_pagina: 1000 };
    if (fornecedorId) params.fornecedor_id = fornecedorId;
    if (categoriaId)  params.categoria_id  = categoriaId;
    if (forma)        params.forma         = forma;
    if (!ref.todos) {
      // Filtra por competência do mês.
      const inicio = `${ref.ano}-${String(ref.mes).padStart(2, '0')}-01`;
      const ultDia = new Date(ref.ano, ref.mes, 0).getDate();
      const fim = `${ref.ano}-${String(ref.mes).padStart(2, '0')}-${ultDia}`;
      params.inicio = inicio; params.fim = fim;
    }
    const req = aba === 'boletos' ? api.boletos(params) : api.despesas(params);

    Promise.all([req, api.alertas(7)])
      .then(([l, a]) => { setLista(l); setAlertas(a); })
      .catch((e) => setErro(e.message));
  }, [escopo, aba, busca, filtroStatus, fornecedorId, categoriaId, forma,
       ref.ano, ref.mes, ref.todos]);

  function limparFiltros() {
    setFiltroStatus(''); setBusca(''); setFornecedorId('');
    setCategoriaId(''); setForma('');
  }
  const temFiltroAtivo = filtroStatus || busca || fornecedorId || categoriaId || forma;

  function mudarMes(delta) {
    setRef((r) => {
      let m = r.mes + delta, a = r.ano;
      if (m > 12) { m = 1; a += 1; }
      if (m < 1)  { m = 12; a -= 1; }
      return { ano: a, mes: m, todos: false };
    });
  }
  const eMesAtual = !ref.todos && ref.ano === hoje.getFullYear() && ref.mes === hoje.getMonth() + 1;

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  const totalListado = lista?.dados.reduce((s, d) => s + d.valor, 0) || 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            {escopo === 'pessoal' ? 'Despesas pessoais' : 'Despesas'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {escopo === 'pessoal'
              ? 'Gastos do dono, separados da contabilidade da oficina'
              : 'Contas da oficina, boletos e pagamentos'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditando(null); setFormAberto(true); }}>
          + Nova despesa
        </button>
      </div>

      {/* Alertas de vencimento em destaque */}
      {alertas && (alertas.atrasadas.length > 0 || alertas.vence_hoje.length > 0) && (
        <div className="anima card border-l-4 border-l-rose-500 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-[15px] font-semibold uppercase tracking-wide text-rose-700">
                {alertas.atrasadas.length > 0 && `${alertas.atrasadas.length} conta(s) atrasada(s)`}
                {alertas.atrasadas.length > 0 && alertas.vence_hoje.length > 0 && ' · '}
                {alertas.vence_hoje.length > 0 && `${alertas.vence_hoje.length} vence(m) hoje`}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {[...alertas.atrasadas, ...alertas.vence_hoje].slice(0, 4).map((d) => (
                  <li key={d.id} className="text-sm text-slate-700">
                    <span className="font-medium">{d.descricao}</span>
                    {d.fornecedor_nome && <span className="text-slate-500"> · {d.fornecedor_nome}</span>}
                    <span className="tnum font-semibold"> — {brl(d.valor)}</span>
                    <span className="text-xs text-rose-600"> ({textoVencimento(d.dias_para_vencer)})</span>
                  </li>
                ))}
              </ul>
            </div>
            <button className="btn-ghost text-xs" onClick={() => { setAba('boletos'); setFiltroStatus('atrasada'); }}>
              Ver todas
            </button>
          </div>
        </div>
      )}

      {/* Seletor de mês */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white p-1 shadow-sm">
          <button onClick={() => mudarMes(-1)} disabled={ref.todos}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:text-slate-300">◀</button>
          <span className="tnum px-3 text-sm font-semibold text-slate-800">
            {ref.todos ? 'Todos os meses' : `${nomeMes(ref.mes)}/${ref.ano}`}
          </span>
          <button onClick={() => mudarMes(1)} disabled={ref.todos}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300">▶</button>
        </div>
        <button onClick={() => setRef({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, todos: false })}
          className="btn-ghost px-3 py-1.5 text-xs" disabled={eMesAtual}>Mês atual</button>
        <button onClick={() => setRef((r) => ({ ...r, todos: !r.todos }))}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md
            ${ref.todos ? 'bg-maninho-600 text-white' : 'btn-ghost'}`}>
          {ref.todos ? '✓ Todos' : 'Ver todos os meses'}
        </button>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
          {[['todas', 'Todas as despesas'], ['boletos', 'Boletos a pagar']].map(([k, t]) => (
            <button key={k} onClick={() => { setAba(k); setFiltroStatus(''); }}
              className={`rounded px-3.5 py-1.5 text-xs font-semibold transition
                ${aba === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {t}
              {k === 'boletos' && alertas?.quantidade > 0 && (
                <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
                  {alertas.quantidade}
                </span>
              )}
            </button>
          ))}
        </div>

        <select className="input max-w-[180px]" value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todas as situações</option>
          <option value="pendente">Pendentes</option>
          <option value="atrasada">Atrasadas</option>
          <option value="paga">Pagas</option>
        </select>

        <input className="input max-w-xs" placeholder="Buscar por descrição, fornecedor ou nota"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {/* Filtros extras */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto min-w-[160px] max-w-[240px] py-1.5 text-xs"
          value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
          <option value="">Todos os fornecedores</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
        <select className="input w-auto min-w-[140px] max-w-[220px] py-1.5 text-xs"
          value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <select className="input w-auto min-w-[140px] py-1.5 text-xs"
          value={forma} onChange={(e) => setForma(e.target.value)}>
          <option value="">Qualquer forma</option>
          {FORMAS_PAGAMENTO.map((f) => (
            <option key={f.valor} value={f.valor}>{f.rotulo}</option>
          ))}
        </select>
        {temFiltroAtivo && (
          <button onClick={limparFiltros}
            className="rounded bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      <div className="card overflow-hidden">
        {!lista ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : lista.dados.length === 0 ? (
          <Vazio titulo="Nenhuma despesa encontrada"
            descricao={aba === 'boletos'
              ? 'Boletos são despesas com data de vencimento preenchida.'
              : 'Lance a primeira despesa da oficina.'}
            acao={<button className="btn-primary mt-3" onClick={() => setFormAberto(true)}>
              + Nova despesa
            </button>} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50/80">
                  <tr>
                    <th className="th w-14">Nº</th>
                    <th className="th">Descrição</th>
                    <th className="th w-40">Fornecedor</th>
                    <th className="th w-36">Categoria</th>
                    <th className="th w-32">Vencimento</th>
                    <th className="th w-28">Forma</th>
                    <th className="th w-24">Situação</th>
                    <th className="th w-28 text-right">Valor</th>
                    <th className="th w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lista.dados.map((d) => (
                    <tr key={d.id}
                      className={`transition hover:bg-maninho-50/60
                        ${d.status === 'atrasada' ? 'bg-rose-50/40' : ''}`}>
                      <td className="td tnum text-xs font-semibold text-maninho-600">{d.numero_despesa}</td>
                      <td className="td">
                        <button onClick={() => { setEditando(d); setFormAberto(true); }}
                          className="text-left font-medium text-slate-800 hover:text-maninho-600 hover:underline">
                          {d.descricao}
                        </button>
                        {d.numero_doc && <p className="text-xs text-slate-500">{d.numero_doc}</p>}
                      </td>
                      <td className="td text-xs text-slate-600">{d.fornecedor_nome || '—'}</td>
                      <td className="td">
                        {d.categoria_nome ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                            <span className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: d.categoria_cor }} />
                            {d.categoria_nome}
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="td">
                        <Vencimento dias={d.dias_para_vencer} vencimento={d.vencimento} />
                      </td>
                      <td className="td text-xs text-slate-600">{rotuloForma(d.forma)}</td>
                      <td className="td"><BadgeDespesa status={d.status} /></td>
                      <td className="td tnum text-right font-semibold text-slate-800">
                        {brl(d.valor)}
                        {d.valor_pago !== null && Math.abs(d.valor_pago - d.valor) > 0.005 && (
                          <p className="text-[11px] font-normal text-slate-500">
                            pago {brl(d.valor_pago)}
                          </p>
                        )}
                      </td>
                      <td className="td text-right">
                        <div className="flex items-center justify-end gap-3">
                          {d.status !== 'paga' && (
                            <button onClick={() => setPagando(d)}
                              className="text-xs font-semibold text-emerald-700 hover:underline">
                              Pagar
                            </button>
                          )}
                          <button onClick={async () => {
                            const aviso = d.status === 'paga'
                              ? `Excluir a despesa "${d.descricao}"? Ela já foi paga — o registro do pagamento vai sumir.`
                              : `Excluir a despesa "${d.descricao}"?`;
                            if (!confirm(aviso)) return;
                            try { await api.cancelarDespesa(d.id); carregar(); }
                            catch (e) { setErro(e.message); }
                          }}
                            className="text-xs font-semibold text-rose-700 hover:underline"
                            title="Excluir despesa">
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200
                            bg-slate-50/60 px-4 py-2.5">
              <span className="text-xs text-slate-500">
                {lista.dados.length} de {lista.paginacao.total} despesas
              </span>
              <span className="tnum text-sm">
                <span className="text-slate-500">Total listado </span>
                <span className="font-display text-lg font-bold text-maninho-700">
                  {brl(totalListado)}
                </span>
              </span>
            </div>
          </>
        )}
      </div>

      <FormDespesa aberto={formAberto} despesa={editando} escopo={escopo}
        onFechar={() => { setFormAberto(false); setEditando(null); }}
        onSalvo={() => { setFormAberto(false); setEditando(null); carregar(); }} />

      <ModalPagar despesa={pagando} onFechar={() => setPagando(null)}
        onPago={() => { setPagando(null); carregar(); }} />
    </div>
  );
}
