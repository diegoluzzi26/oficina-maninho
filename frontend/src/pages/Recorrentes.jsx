import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { brl, rotuloForma, FORMAS_PAGAMENTO } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

function FormRecorrente({ aberto, recorrente, onFechar, onSalvo }) {
  const vazio = {
    descricao: '', valor: '', forma: 'boleto', escopo: 'oficina',
    dia_do_mes: 5, categoria_id: '', observacoes: '',
  };
  const [form, setForm] = useState(vazio);
  const [categorias, setCategorias] = useState([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    api.categorias().then(setCategorias).catch(() => {});
  }, [aberto]);

  useEffect(() => {
    setErro('');
    setForm(recorrente ? {
      ...vazio, ...recorrente,
      valor: String(recorrente.valor),
      categoria_id: recorrente.categoria_id || '',
    } : vazio);
  }, [recorrente, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const body = {
        descricao: form.descricao,
        valor: Number(form.valor),
        forma: form.forma,
        escopo: form.escopo,
        dia_do_mes: Number(form.dia_do_mes),
        categoria_id: form.categoria_id || null,
        observacoes: form.observacoes || null,
      };
      const salvo = recorrente
        ? await api.atualizarRecorrente(recorrente.id, body)
        : await api.criarRecorrente(body);
      onSalvo(salvo);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar}
      titulo={recorrente ? `Editar recorrente` : 'Nova despesa recorrente'}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Descrição" obrigatorio>
          <input className="input" value={form.descricao} onChange={set('descricao')} required autoFocus
            placeholder="Aluguel do galpão" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Valor (R$)" obrigatorio>
            <input type="number" step="0.01" min="0.01" required className="input tnum"
              value={form.valor} onChange={set('valor')} placeholder="3500.00" />
          </Campo>
          <Campo label="Dia do vencimento" obrigatorio
            ajuda="1 a 28 (evita meses curtos)">
            <input type="number" min="1" max="28" required className="input tnum"
              value={form.dia_do_mes} onChange={set('dia_do_mes')} />
          </Campo>
          <Campo label="Forma">
            <select className="input" value={form.forma} onChange={set('forma')}>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.valor} value={f.valor}>{f.rotulo}</option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Escopo" obrigatorio>
            <select className="input" value={form.escopo} onChange={set('escopo')}>
              <option value="oficina">Oficina</option>
              <option value="pessoal">Pessoal</option>
            </select>
          </Campo>
          <Campo label="Categoria">
            <select className="input" value={form.categoria_id} onChange={set('categoria_id')}>
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </Campo>
        </div>

        <Campo label="Observações">
          <input className="input" value={form.observacoes} onChange={set('observacoes')}
            placeholder="Ex: pagamento via Pix pro proprietário" />
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

export default function Recorrentes() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [gerando, setGerando] = useState(false);

  function carregar() {
    setErro('');
    api.despesasRecorrentes().then(setLista).catch((e) => setErro(e.message));
  }
  useEffect(() => { carregar(); }, []);

  async function excluir(r) {
    if (!confirm(`Desativar "${r.descricao}"? Deixa de gerar nos próximos meses.`)) return;
    try { await api.desativarRecorrente(r.id); carregar(); }
    catch (e) { setErro(e.message); }
  }

  async function gerarAgora() {
    setGerando(true); setErro(''); setOk('');
    try {
      const r = await api.gerarRecorrentes();
      setOk(`${r.gerados} despesa(s) gerada(s).`);
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setGerando(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Despesas recorrentes
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {lista ? `${lista.length} ativas` : 'Carregando…'} · geradas automaticamente quando chega o dia do mês
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={gerarAgora} disabled={gerando} className="btn-ghost">
            {gerando ? '…' : '↻ Gerar pendentes agora'}
          </button>
          <button className="btn-primary" onClick={() => { setEditando(null); setFormAberto(true); }}>
            + Nova recorrente
          </button>
        </div>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {ok   && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}

      {!lista ? (
        <Skeleton className="h-40" />
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio titulo="Nenhuma despesa recorrente cadastrada"
            descricao="Cadastre aluguel, água, luz, salários fixos — o sistema gera todo mês pra você." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {lista.map((r) => (
              <li key={r.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {r.descricao}
                    {r.escopo === 'pessoal' && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        pessoal
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    Todo dia <b>{r.dia_do_mes}</b> · {rotuloForma(r.forma)}
                    {r.categoria_nome && ` · ${r.categoria_nome}`}
                    {r.ultima_competencia && ` · última: ${new Date(r.ultima_competencia).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <div className="w-28 text-right">
                  <p className="tnum font-semibold text-maninho-700">{brl(r.valor)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditando(r); setFormAberto(true); }}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-maninho-600 hover:bg-maninho-50">
                    Editar
                  </button>
                  <button onClick={() => excluir(r)}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FormRecorrente aberto={formAberto} recorrente={editando}
        onFechar={() => setFormAberto(false)}
        onSalvo={() => { setFormAberto(false); carregar(); }} />
    </div>
  );
}
