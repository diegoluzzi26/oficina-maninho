import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { brl, data, telefone, hojeISO } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

/**
 * Cadastro de funcionários da oficina + ficha individual com vales.
 * Só admin acessa. Vales rastreados por funcionário — quitação
 * automática pelo pagamento do salário é feature futura (por agora
 * o vale só entra como referência visual).
 */

function FormFuncionario({ aberto, funcionario, onFechar, onSalvo }) {
  const vazio = { nome: '', cargo: '', salario_base: '', periodicidade: 'mensal',
    telefone: '', observacoes: '' };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setErro('');
    setForm(funcionario ? {
      ...vazio, ...funcionario,
      salario_base: funcionario.salario_base != null ? String(funcionario.salario_base) : '',
      periodicidade: funcionario.periodicidade || 'mensal',
      telefone: funcionario.telefone || '',
    } : vazio);
  }, [funcionario, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const body = {
        nome: form.nome,
        cargo: form.cargo || null,
        salario_base: form.salario_base === '' ? null : Number(form.salario_base),
        periodicidade: form.periodicidade || 'mensal',
        telefone: form.telefone || null,
        observacoes: form.observacoes || null,
      };
      const salvo = funcionario
        ? await api.atualizarFuncionario(funcionario.id, body)
        : await api.criarFuncionario(body);
      onSalvo(salvo);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar}
      titulo={funcionario ? `Editar ${funcionario.nome}` : 'Novo funcionário'}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')} required autoFocus />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Cargo" ajuda="Ex.: Mecânico, Atendente">
            <input className="input" value={form.cargo} onChange={set('cargo')} />
          </Campo>
          <Campo label="Salário base (R$)"
            ajuda="Opcional. Usado como referência ao pagar salário.">
            <input type="number" step="0.01" min="0" className="input tnum"
              value={form.salario_base} onChange={set('salario_base')} placeholder="2500.00" />
          </Campo>
        </div>
        <Campo label="Frequência do pagamento"
          ajuda="Quantas vezes o salário é pago no mês.">
          <select className="input max-w-[220px]" value={form.periodicidade}
            onChange={set('periodicidade')}>
            <option value="mensal">Mensal · 1× por mês</option>
            <option value="quinzenal">Quinzenal · 15 em 15 dias</option>
            <option value="semanal">Semanal · toda semana</option>
          </select>
        </Campo>
        <Campo label="Telefone (E.164)" ajuda="Ex.: (51) 99888-7777">
          <input className="input" value={form.telefone} onChange={set('telefone')}
            placeholder="(51) 99888-7777" />
        </Campo>
        <Campo label="Observações">
          <textarea className="input min-h-[60px] resize-y" value={form.observacoes}
            onChange={set('observacoes')} placeholder="Data de admissão, particularidades…" />
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

function FormVale({ aberto, funcionario, onFechar, onSalvo }) {
  const [valor, setValor] = useState('');
  const [dataVale, setDataVale] = useState(hojeISO());
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) { setValor(''); setDataVale(hojeISO()); setObs(''); setErro(''); }
  }, [aberto]);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      await api.darVale({
        funcionario_id: funcionario.id,
        valor: Number(valor),
        data_vale: dataVale,
        observacoes: obs || null,
      });
      onSalvo();
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  if (!funcionario) return null;
  return (
    <Modal aberto={aberto} titulo={`Dar vale — ${funcionario.nome}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Valor (R$)" obrigatorio>
            <input type="number" step="0.01" min="0.01" className="input tnum" required autoFocus
              value={valor} onChange={(e) => setValor(e.target.value)} placeholder="100.00" />
          </Campo>
          <Campo label="Data" obrigatorio>
            <input type="date" className="input" required
              value={dataVale} onChange={(e) => setDataVale(e.target.value)} />
          </Campo>
        </div>
        <Campo label="Observações">
          <input className="input" value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="Adiantamento pra emergência" />
        </Campo>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-ouro" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Registrar vale'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FormFalta({ aberto, funcionario, onFechar, onSalvo }) {
  const [dataFalta, setDataFalta] = useState(hojeISO());
  const [justificada, setJustificada] = useState(false);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setDataFalta(hojeISO()); setJustificada(false); setObs(''); setErro('');
    }
  }, [aberto]);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      await api.registrarFalta({
        funcionario_id: funcionario.id,
        data_falta: dataFalta,
        justificada,
        observacoes: obs || null,
      });
      onSalvo();
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  if (!funcionario) return null;
  return (
    <Modal aberto={aberto} titulo={`Registrar falta — ${funcionario.nome}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Data da falta" obrigatorio>
            <input type="date" className="input" required autoFocus
              value={dataFalta} onChange={(e) => setDataFalta(e.target.value)} />
          </Campo>
          <Campo label="Justificada?" ajuda="Falta com atestado ou aviso prévio">
            <label className="flex h-[42px] items-center gap-2 rounded-md border border-slate-300 bg-white px-3">
              <input type="checkbox" checked={justificada}
                onChange={(e) => setJustificada(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300" />
              <span className="text-sm text-slate-700">Sim, foi justificada</span>
            </label>
          </Campo>
        </div>
        <Campo label="Observações">
          <input className="input" value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="Atestado médico, avisou antes, etc." />
        </Campo>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Registrar falta'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetalheFuncionario({ id, onFechar, onAtualizado }) {
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState('');
  const [valeAberto, setValeAberto] = useState(false);
  const [faltaAberto, setFaltaAberto] = useState(false);

  function recarregar() {
    if (!id) return;
    api.fichaFuncionario(id).then(setFicha).catch((e) => setErro(e.message));
  }
  useEffect(() => { recarregar(); }, [id]);

  async function removerVale(v) {
    if (!confirm(`Remover vale de ${brl(v.valor)} do dia ${data(v.data_vale)}?`)) return;
    try { await api.removerVale(v.id); recarregar(); onAtualizado?.(); }
    catch (e) { setErro(e.message); }
  }

  async function removerFalta(f) {
    if (!confirm(`Remover a falta do dia ${data(f.data_falta)}?`)) return;
    try { await api.removerFalta(f.id); recarregar(); onAtualizado?.(); }
    catch (e) { setErro(e.message); }
  }

  if (!id) return null;

  return (
    <Modal aberto={!!id} onFechar={onFechar} largura="max-w-2xl"
      titulo={ficha?.funcionario.nome || 'Funcionário'}>
      {!ficha ? <Skeleton className="h-40" /> : (
        <div className="space-y-4">
          {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

          <div className="grid gap-4 rounded-md bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <p className="label mb-0.5">Cargo</p>
              <p className="text-sm text-slate-800">{ficha.funcionario.cargo || '—'}</p>
            </div>
            <div>
              <p className="label mb-0.5">Salário base</p>
              <p className="tnum text-sm font-semibold text-slate-800">
                {ficha.funcionario.salario_base ? brl(ficha.funcionario.salario_base) : '—'}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ouro-700">
                {ficha.funcionario.periodicidade === 'semanal'   ? 'toda semana'
                 : ficha.funcionario.periodicidade === 'quinzenal' ? 'a cada 15 dias'
                 : 'mensal'}
              </p>
            </div>
            <div>
              <p className="label mb-0.5">Telefone</p>
              <p className="text-sm text-slate-800">{telefone(ficha.funcionario.telefone) || '—'}</p>
            </div>
          </div>

          {/* Bloco de resumo com vales pendentes */}
          <div className={`rounded-md border-l-4 p-4
            ${ficha.resumo.vales_pendentes > 0
              ? 'border-l-ouro-500 bg-ouro-100/40'
              : 'border-l-emerald-500 bg-emerald-50/50'}`}>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="label mb-0.5">Vales pendentes</p>
                <p className="tnum text-2xl font-bold text-slate-800">
                  {brl(ficha.resumo.vales_pendentes)}
                </p>
              </div>
              <button onClick={() => setValeAberto(true)} className="btn-ouro">
                + Dar vale
              </button>
            </div>
            {ficha.funcionario.salario_base && ficha.resumo.vales_pendentes > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                Se pagar o salário base hoje: {brl(ficha.funcionario.salario_base)} − vales {brl(ficha.resumo.vales_pendentes)} = <b>{brl(ficha.funcionario.salario_base - ficha.resumo.vales_pendentes)}</b> a pagar.
              </p>
            )}
          </div>

          {/* Bloco de faltas */}
          <div className={`rounded-md border-l-4 p-4
            ${ficha.resumo.faltas_semana > 0
              ? 'border-l-rose-500 bg-rose-50/50'
              : 'border-l-slate-300 bg-slate-50'}`}>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="label mb-0.5">
                  Faltas nesta semana
                  <span className="ml-1 font-normal text-slate-500">
                    (desde {data(ficha.resumo.inicio_semana)})
                  </span>
                </p>
                <p className="tnum text-2xl font-bold text-slate-800">
                  {ficha.resumo.faltas_semana}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {ficha.resumo.faltas_mes} no mês · {ficha.resumo.faltas_total} no total (histórico)
                </p>
              </div>
              <button onClick={() => setFaltaAberto(true)} className="btn-ghost">
                + Registrar falta
              </button>
            </div>
          </div>

          {/* Lista de faltas */}
          {ficha.faltas.length > 0 && (
            <div>
              <p className="label mb-2">Últimas faltas</p>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {ficha.faltas.slice(0, 12).map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="tnum text-sm font-semibold text-slate-800">
                      {data(f.data_falta)}
                    </span>
                    {f.justificada ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        justificada
                      </span>
                    ) : (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                        não justificada
                      </span>
                    )}
                    <span className="flex-1 truncate text-xs text-slate-500">
                      {f.observacoes || ''}
                    </span>
                    <button onClick={() => removerFalta(f)}
                      className="text-[11px] font-semibold text-rose-600 hover:underline">
                      remover
                    </button>
                  </li>
                ))}
              </ul>
              {ficha.faltas.length > 12 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  mostrando as 12 mais recentes de {ficha.faltas.length} registradas
                </p>
              )}
            </div>
          )}

          {/* Lista de vales */}
          <div>
            <p className="label mb-2">Últimos vales</p>
            {ficha.vales.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">
                Nenhum vale registrado
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {ficha.vales.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="tnum font-semibold text-slate-800">{brl(v.valor)}</span>
                    <span className="text-xs text-slate-500">{data(v.data_vale)}</span>
                    {v.quitado_em ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        quitado
                      </span>
                    ) : (
                      <span className="rounded bg-ouro-100 px-1.5 py-0.5 text-[10px] font-semibold text-ouro-700">
                        pendente
                      </span>
                    )}
                    <span className="flex-1 truncate text-xs text-slate-500">{v.observacoes || ''}</span>
                    {!v.quitado_em && (
                      <button onClick={() => removerVale(v)}
                        className="text-[11px] font-semibold text-rose-600 hover:underline">
                        remover
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <FormVale aberto={valeAberto} funcionario={ficha?.funcionario}
        onFechar={() => setValeAberto(false)}
        onSalvo={() => { setValeAberto(false); recarregar(); onAtualizado?.(); }} />

      <FormFalta aberto={faltaAberto} funcionario={ficha?.funcionario}
        onFechar={() => setFaltaAberto(false)}
        onSalvo={() => { setFaltaAberto(false); recarregar(); onAtualizado?.(); }} />
    </Modal>
  );
}

export default function Funcionarios() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [detalheId, setDetalheId] = useState(null);

  function carregar() {
    setErro('');
    api.funcionarios().then(setLista).catch((e) => setErro(e.message));
  }
  useEffect(() => { carregar(); }, []);

  async function excluir(f) {
    if (!confirm(`Desativar funcionário ${f.nome}?`)) return;
    try { await api.desativarFuncionario(f.id); carregar(); }
    catch (e) { setErro(e.message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Funcionários
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {lista ? `${lista.length} ativos` : 'Carregando…'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditando(null); setFormAberto(true); }}>
          + Novo funcionário
        </button>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!lista ? (
        <Skeleton className="h-40" />
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio titulo="Nenhum funcionário cadastrado"
            descricao="Cadastre pra rastrear vales e pagamentos de salário." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {lista.map((f) => (
              <li key={f.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/60">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setDetalheId(f.id)}>
                  <p className="text-sm font-semibold text-slate-800">{f.nome}</p>
                  <p className="text-xs text-slate-500">
                    {f.cargo || 'sem cargo'}
                    {f.salario_base ? ` · ${brl(f.salario_base)}` : ''}
                    {f.salario_base && (
                      <span className="ml-1 text-slate-400">/ {
                        f.periodicidade === 'semanal'   ? 'semana'
                        : f.periodicidade === 'quinzenal' ? 'quinzena'
                        : 'mês'
                      }</span>
                    )}
                  </p>
                </div>
                {f.vales_pendentes > 0 && (
                  <div className="text-right">
                    <p className="tnum text-sm font-semibold text-ouro-700">{brl(f.vales_pendentes)}</p>
                    <p className="text-[10px] text-slate-500">
                      {f.qtd_vales_pendentes} vale{f.qtd_vales_pendentes === 1 ? '' : 's'} pendente{f.qtd_vales_pendentes === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
                {f.faltas_semana > 0 && (
                  <div className="text-right">
                    <p className="tnum text-sm font-semibold text-rose-700">
                      {f.faltas_semana}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      falta{f.faltas_semana === 1 ? '' : 's'} na semana
                    </p>
                  </div>
                )}
                <div className="flex gap-1">
                  <button onClick={() => setDetalheId(f.id)}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-maninho-600 hover:bg-maninho-50">
                    Ver ficha
                  </button>
                  <button onClick={() => { setEditando(f); setFormAberto(true); }}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">
                    Editar
                  </button>
                  <button onClick={() => excluir(f)}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FormFuncionario aberto={formAberto} funcionario={editando}
        onFechar={() => setFormAberto(false)}
        onSalvo={() => { setFormAberto(false); carregar(); }} />

      <DetalheFuncionario id={detalheId} onFechar={() => setDetalheId(null)}
        onAtualizado={carregar} />
    </div>
  );
}
