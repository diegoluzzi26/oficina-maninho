import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { brl, data, telefone, STATUS_DESPESA } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

function FormFornecedor({ aberto, fornecedor, onFechar, onSalvo }) {
  const vazio = {
    nome: '', cnpj_cpf: '', telefone: '', email: '',
    endereco: '', contato: '', observacoes: '',
  };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setForm(fornecedor ? { ...vazio, ...fornecedor } : vazio);
    setErro('');
  }, [fornecedor, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const body = {
        nome: form.nome,
        cnpj_cpf: form.cnpj_cpf || null,
        telefone: form.telefone || null,
        email: form.email || null,
        endereco: form.endereco || null,
        contato: form.contato || null,
        observacoes: form.observacoes || null,
      };
      const salvo = fornecedor
        ? await api.atualizarFornecedor(fornecedor.id, body)
        : await api.criarFornecedor(body);
      onSalvo(salvo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar}
      titulo={fornecedor ? `Editar fornecedor #${fornecedor.numero_forn}` : 'Novo fornecedor'}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome / Razão social" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')} required autoFocus
            placeholder="Distribuidora Auto Peças RS" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="CNPJ / CPF">
            <input className="input" value={form.cnpj_cpf || ''} onChange={set('cnpj_cpf')}
              placeholder="11.222.333/0001-44" />
          </Campo>
          <Campo label="Telefone">
            <input className="input" value={form.telefone || ''} onChange={set('telefone')}
              placeholder="(51) 3222-4455" />
          </Campo>
          <Campo label="Pessoa de contato">
            <input className="input" value={form.contato || ''} onChange={set('contato')}
              placeholder="Sr. Antônio — vendedor" />
          </Campo>
          <Campo label="E-mail">
            <input type="email" className="input" value={form.email || ''} onChange={set('email')}
              placeholder="vendas@fornecedor.com.br" />
          </Campo>
        </div>

        <Campo label="Endereço">
          <input className="input" value={form.endereco || ''} onChange={set('endereco')} />
        </Campo>

        <Campo label="Observações">
          <textarea className="input min-h-[60px] resize-y" value={form.observacoes || ''}
            onChange={set('observacoes')} placeholder="Prazo de entrega, condições de pagamento…" />
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

function DetalheFornecedor({ id, onFechar }) {
  const [forn, setForn] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!id) return;
    api.fornecedor(id).then(setForn).catch((e) => setErro(e.message));
  }, [id]);

  if (!id) return null;

  return (
    <Modal aberto largura="max-w-2xl" onFechar={onFechar}
      titulo={forn ? `#${forn.numero_forn} — ${forn.nome}` : 'Carregando…'}>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {!forn ? <Skeleton className="h-40" /> : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><p className="label">CNPJ/CPF</p><p>{forn.cnpj_cpf || '—'}</p></div>
            <div><p className="label">Telefone</p><p>{telefone(forn.telefone)}</p></div>
            <div><p className="label">Contato</p><p>{forn.contato || '—'}</p></div>
            <div><p className="label">E-mail</p><p className="break-all">{forn.email || '—'}</p></div>
            {forn.endereco && (
              <div className="sm:col-span-2"><p className="label">Endereço</p><p>{forn.endereco}</p></div>
            )}
            {forn.observacoes && (
              <div className="sm:col-span-2">
                <p className="label">Observações</p>
                <p className="text-slate-600">{forn.observacoes}</p>
              </div>
            )}
          </div>

          <div>
            <p className="label mb-2">Últimas despesas ({forn.despesas.length})</p>
            {forn.despesas.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">
                Nenhuma despesa lançada para este fornecedor
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {forn.despesas.map((d) => {
                  const s = STATUS_DESPESA[d.status] || STATUS_DESPESA.pendente;
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">{d.descricao}</p>
                        <p className="text-xs text-slate-500">
                          {d.vencimento ? `vence ${data(d.vencimento)}` : data(d.competencia)}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold
                                        ring-1 ring-inset ${s.classe}`}>
                        {s.texto}
                      </span>
                      <span className="tnum w-24 text-right text-sm font-semibold">
                        {brl(d.valor)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Fornecedores() {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [detalheId, setDetalheId] = useState(null);

  const carregar = useCallback(() => {
    setErro('');
    api.fornecedores({ busca }).then(setLista).catch((e) => setErro(e.message));
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  const totalEmAberto = lista?.reduce((s, f) => s + f.em_aberto, 0) || 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Fornecedores</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {lista ? `${lista.length} cadastrados` : 'Carregando…'}
            {totalEmAberto > 0 && ` · ${brl(totalEmAberto)} em aberto`}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditando(null); setFormAberto(true); }}>
          + Novo fornecedor
        </button>
      </div>

      <input className="input max-w-sm" placeholder="Buscar por nome, CNPJ ou contato"
        value={busca} onChange={(e) => setBusca(e.target.value)} />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {!lista ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio titulo="Nenhum fornecedor cadastrado"
            descricao="Cadastre as distribuidoras e lojas de peças que você usa."
            acao={<button className="btn-primary mt-3" onClick={() => setFormAberto(true)}>
              + Novo fornecedor
            </button>} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((f, i) => (
            <div key={f.id} className="card anima flex flex-col p-4"
              style={{ animationDelay: `${Math.min(i * 40, 320)}ms` }}>
              <button onClick={() => setDetalheId(f.id)} className="text-left">
                <h3 className="font-display text-[15px] font-semibold uppercase tracking-wide leading-snug text-maninho-800
                               hover:text-maninho-600 hover:underline">
                  {f.nome}
                </h3>
              </button>
              <p className="mt-0.5 text-xs text-slate-500">{f.cnpj_cpf || 'Sem CNPJ'}</p>

              <div className="mt-3 space-y-1 text-xs text-slate-600">
                {f.contato && <p>👤 {f.contato}</p>}
                {f.telefone && <p>📞 {telefone(f.telefone)}</p>}
              </div>

              <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-3">
                <div>
                  <p className="label">Em aberto</p>
                  <p className={`numero text-lg
                                 ${f.em_aberto > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {brl(f.em_aberto)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-500">{f.qtd_despesas} despesas</p>
                  <button onClick={() => { setEditando(f); setFormAberto(true); }}
                    className="text-xs font-semibold text-maninho-600 hover:underline">
                    Editar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <FormFornecedor aberto={formAberto} fornecedor={editando}
        onFechar={() => { setFormAberto(false); setEditando(null); }}
        onSalvo={() => { setFormAberto(false); setEditando(null); carregar(); }} />

      {detalheId && <DetalheFornecedor id={detalheId} onFechar={() => setDetalheId(null)} />}
    </div>
  );
}
