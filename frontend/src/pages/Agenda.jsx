import { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import { nomeMes, telefone } from '../lib/format';
import { Alerta, Modal, Campo, Spinner, Skeleton, Vazio } from '../components/ui';
import { SeletorMarcaModelo } from '../components/SeletorMarcaModelo';

// ---------------------------------------------------------------------
// Utilidades de data (evita depender de moment/dayjs)
// ---------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hojeISO = () => isoDia(new Date());

// Devolve uma matriz 6x7 com objetos { data, ehDoMes }
// começando na segunda-feira anterior ao dia 1 do mês.
function gradeDoMes(ano, mes /* 1-12 */) {
  const primeiro = new Date(ano, mes - 1, 1);
  // Segunda = 1, mas em JS domingo = 0. Queremos que a grade comece na segunda.
  const desloca = (primeiro.getDay() + 6) % 7;
  const inicio = new Date(ano, mes - 1, 1 - desloca);

  const dias = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    dias.push({ data: d, ehDoMes: d.getMonth() === mes - 1 });
  }
  return dias;
}

const DIAS_SEM = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function horaDe(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR',
    { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

// ---------------------------------------------------------------------
// Modal novo/editar agendamento
// ---------------------------------------------------------------------
function FormAgendamento({ aberto, editando, dataInicial, onFechar, onSalvo }) {
  const [clientes, setClientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [carros, setCarros] = useState([]);
  const [carroId, setCarroId] = useState('');
  const [modoCliente, setModoCliente] = useState('existente'); // 'existente' | 'novo'
  const [modoCarro, setModoCarro] = useState('existente');
  const [novoCliente, setNovoCliente] = useState({ nome: '', telefone: '', cpf_cnpj: '', email: '' });
  const [novoCarro, setNovoCarro] = useState({ placa: '', marca: '', modelo: '', ano: '', cor: '', km_atual: '' });
  const [dataHora, setDataHora] = useState('');
  const [duracao, setDuracao] = useState(60);
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState([]);  // [{servico_id, nome_servico}]
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    api.servicos().then(setServicos).catch(() => {});
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => {
      api.clientes({ por_pagina: 100, busca: buscaCliente })
        .then((c) => setClientes(c.dados))
        .catch((e) => setErro(`Erro ao buscar clientes: ${e.message}`));
    }, buscaCliente ? 300 : 0);
    return () => clearTimeout(t);
  }, [aberto, buscaCliente]);

  // Reset quando abre / carrega valores se está editando
  useEffect(() => {
    if (!aberto) return;
    if (editando) {
      setClienteId(editando.cliente_id);
      setCarroId(editando.carro_id);
      // "YYYY-MM-DDTHH:MM" pro datetime-local, ajustando pro fuso local
      const d = new Date(editando.data_agendada);
      const off = d.getTimezoneOffset();
      const local = new Date(d.getTime() - off * 60000);
      setDataHora(local.toISOString().slice(0, 16));
      setDuracao(editando.duracao_min || 60);
      setObs(editando.observacoes || '');
      setItens((editando.servicos || []).map((s) => ({
        servico_id: s.servico_id, nome_servico: s.nome_servico,
      })));
    } else {
      setClienteId('');
      setCarroId('');
      setModoCliente('existente');
      setModoCarro('existente');
      setNovoCliente({ nome: '', telefone: '', cpf_cnpj: '', email: '' });
      setNovoCarro({ placa: '', marca: '', modelo: '', ano: '', cor: '', km_atual: '' });
      setDataHora(dataInicial ? `${dataInicial}T08:00` : '');
      setDuracao(60);
      setObs('');
      setItens([]);
    }
    setErro('');
  }, [aberto, editando, dataInicial]);

  useEffect(() => {
    if (modoCliente !== 'existente' || !clienteId) { setCarros([]); return; }
    api.cliente(clienteId).then((c) => {
      setCarros(c.carros || []);
      if (!editando && c.carros?.length === 1) setCarroId(c.carros[0].id);
      setModoCarro(c.carros?.length ? 'existente' : 'novo');
    }).catch(() => {});
  }, [clienteId, modoCliente, editando]);

  function addServicoCatalogo() {
    const s = servicos[0];
    if (!s) return;
    setItens((v) => [...v, { servico_id: s.id, nome_servico: s.nome }]);
  }
  function addServicoLivre() {
    setItens((v) => [...v, { servico_id: null, nome_servico: '' }]);
  }
  function trocarItem(idx, campo, valor) {
    setItens((v) => v.map((x, i) => {
      if (i !== idx) return x;
      if (campo === 'servico_id') {
        const s = servicos.find((y) => y.id === valor);
        return { servico_id: valor, nome_servico: s?.nome || x.nome_servico };
      }
      return { ...x, [campo]: valor };
    }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const body = {
        data_agendada: dataHora,
        duracao_min: Number(duracao),
        observacoes: obs || null,
        servicos: itens.filter((i) => i.servico_id || i.nome_servico.trim()),
      };
      // Edição sempre usa IDs existentes; criação pode mandar novo_*
      if (editando) {
        body.cliente_id = clienteId;
        body.carro_id = carroId;
      } else {
        if (modoCliente === 'existente') body.cliente_id = clienteId;
        else body.novo_cliente = novoCliente;

        if (modoCliente === 'novo' || modoCarro === 'novo') body.novo_carro = novoCarro;
        else body.carro_id = carroId;
      }

      const salvo = editando
        ? await api.atualizarAgendamento(editando.id, body)
        : await api.criarAgendamento(body);
      onSalvo(salvo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const clientePronto = modoCliente === 'existente' ? !!clienteId
    : !!(novoCliente.nome && novoCliente.telefone);
  const carroPronto = (modoCliente === 'novo' || modoCarro === 'novo')
    ? !!(novoCarro.placa && novoCarro.marca && novoCarro.modelo)
    : !!carroId;

  return (
    <Modal aberto={aberto} titulo={editando ? `Editar agendamento` : 'Novo agendamento'}
      largura="max-w-2xl" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        {/* Cliente — toggle existente/novo (só na criação, edição sempre usa o já vinculado) */}
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Cliente</span>
            {!editando && (
              <div className="flex rounded border border-slate-300 p-0.5">
                {[['existente', 'Existente'], ['novo', 'Cadastrar novo']].map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setModoCliente(k)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition
                      ${modoCliente === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {modoCliente === 'existente' || editando ? (
            <div className="space-y-2">
              <input className="input" placeholder="Buscar cliente…"
                value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
              <select className="input" value={clienteId} required
                disabled={!!editando}
                onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Selecione…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>#{c.numero_cliente} — {c.nome}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nome" obrigatorio>
                <input className="input" value={novoCliente.nome} required
                  onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} />
              </Campo>
              <Campo label="Telefone" obrigatorio ajuda="(51) 99888-7777">
                <input className="input" value={novoCliente.telefone} required
                  onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} />
              </Campo>
              <Campo label="CPF/CNPJ">
                <input className="input" value={novoCliente.cpf_cnpj}
                  onChange={(e) => setNovoCliente({ ...novoCliente, cpf_cnpj: e.target.value })} />
              </Campo>
              <Campo label="E-mail">
                <input type="email" className="input" value={novoCliente.email}
                  onChange={(e) => setNovoCliente({ ...novoCliente, email: e.target.value })} />
              </Campo>
            </div>
          )}
        </div>

        {/* Veículo */}
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Veículo</span>
            {!editando && modoCliente === 'existente' && carros.length > 0 && (
              <div className="flex rounded border border-slate-300 p-0.5">
                {[['existente', 'Existente'], ['novo', 'Cadastrar novo']].map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setModoCarro(k)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition
                      ${modoCarro === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!editando && (modoCliente === 'novo' || modoCarro === 'novo') ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Placa" obrigatorio>
                <input className="input font-mono uppercase" value={novoCarro.placa} required
                  placeholder="ABC1D23"
                  onChange={(e) => setNovoCarro({ ...novoCarro, placa: e.target.value.toUpperCase() })} />
              </Campo>
              <SeletorMarcaModelo marca={novoCarro.marca} modelo={novoCarro.modelo} obrigatorio
                onChange={({ marca, modelo }) => setNovoCarro({ ...novoCarro, marca, modelo })} />
              <Campo label="Ano">
                <input type="number" min="1900" max="2100" className="input" value={novoCarro.ano}
                  onChange={(e) => setNovoCarro({ ...novoCarro, ano: e.target.value })} />
              </Campo>
              <Campo label="Cor">
                <input className="input" value={novoCarro.cor}
                  onChange={(e) => setNovoCarro({ ...novoCarro, cor: e.target.value })} />
              </Campo>
              <Campo label="KM atual">
                <input type="number" min="0" className="input" value={novoCarro.km_atual}
                  onChange={(e) => setNovoCarro({ ...novoCarro, km_atual: e.target.value })} />
              </Campo>
            </div>
          ) : (
            <select className="input" value={carroId} required
              disabled={modoCliente === 'existente' && !clienteId}
              onChange={(e) => setCarroId(e.target.value)}>
              <option value="">
                {modoCliente === 'existente' && !clienteId ? 'Escolha o cliente antes' : 'Selecione…'}
              </option>
              {carros.map((c) => (
                <option key={c.id} value={c.id}>{c.placa} — {c.marca} {c.modelo}</option>
              ))}
            </select>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Data e hora" obrigatorio>
            <input type="datetime-local" className="input" value={dataHora} required
              onChange={(e) => setDataHora(e.target.value)} />
          </Campo>

          <Campo label="Duração prevista (min)">
            <input type="number" min="5" max="720" step="5" className="input tnum"
              value={duracao} onChange={(e) => setDuracao(e.target.value)} />
          </Campo>
        </div>

        {/* Serviços: catálogo + texto livre */}
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Serviços a executar</span>
            <div className="flex gap-1">
              <button type="button" onClick={addServicoCatalogo}
                className="btn-ghost px-2.5 py-1 text-xs">+ Do catálogo</button>
              <button type="button" onClick={addServicoLivre}
                className="btn-ghost px-2.5 py-1 text-xs">+ Texto livre</button>
            </div>
          </div>
          {itens.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">
              Nenhum serviço listado. Você pode deixar em branco e detalhar só na observação.
            </p>
          ) : (
            <div className="space-y-2">
              {itens.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {it.servico_id !== null ? (
                    <select className="input flex-1 py-1.5 text-xs"
                      value={it.servico_id || ''}
                      onChange={(e) => trocarItem(idx, 'servico_id', e.target.value)}>
                      {servicos.map((s) => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="input flex-1 py-1.5 text-xs" placeholder="Ex.: verificar barulho estranho no motor"
                      value={it.nome_servico}
                      onChange={(e) => trocarItem(idx, 'nome_servico', e.target.value)} />
                  )}
                  <button type="button"
                    onClick={() => setItens((v) => v.filter((_, i) => i !== idx))}
                    className="px-1.5 text-slate-400 hover:text-rose-600" title="Remover">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Campo label="Observações">
          <textarea className="input min-h-[68px] resize-y" value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Cliente pediu pra deixar o carro antes das 9h, vai buscar às 17h" />
        </Campo>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary"
            disabled={salvando || !clientePronto || !carroPronto || !dataHora}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : (editando ? 'Salvar' : 'Agendar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Painel do dia (aparece ao clicar num dia do calendário)
// ---------------------------------------------------------------------
function PainelDia({ dia, agendamentos, onNovo, onEditar, onAcao }) {
  if (!dia) return null;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <p className="label">Dia selecionado</p>
          <h3 className="font-display text-lg font-semibold text-maninho-800">
            {new Date(dia).toLocaleDateString('pt-BR',
              { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </h3>
        </div>
        <button className="btn-primary px-3 py-1.5 text-xs" onClick={onNovo}>
          + Agendar
        </button>
      </div>

      {agendamentos.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nada agendado neste dia.</p>
      ) : (
        <ul className="space-y-3">
          {agendamentos.map((a) => (
            <li key={a.id}
              className={`rounded-md border-l-2 p-3 transition
                ${a.status === 'cancelado' ? 'border-l-slate-300 bg-slate-50 opacity-60'
                  : a.status === 'concluido' ? 'border-l-emerald-500 bg-emerald-50/50'
                  : 'border-l-maninho-600 bg-maninho-50/40 hover:bg-maninho-50'}`}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="tnum font-display text-lg font-bold text-maninho-700">
                      {horaDe(a.data_agendada)}
                    </span>
                    <span className="text-xs text-slate-500">· {a.duracao_min}min</span>
                    {a.status !== 'agendado' && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase
                        ${a.status === 'concluido' ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'}`}>
                        {a.status === 'concluido' ? `OS #${a.numero_os || '—'}` : 'cancelado'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{a.cliente_nome}</p>
                  <p className="font-mono text-xs text-slate-500">
                    {a.placa} · {a.marca} {a.modelo} · {telefone(a.cliente_telefone)}
                  </p>
                  {a.servicos?.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {a.servicos.map((s) => (
                        <li key={s.id} className="text-xs text-slate-600">• {s.nome_servico}</li>
                      ))}
                    </ul>
                  )}
                  {a.observacoes && (
                    <p className="mt-1 text-xs italic text-slate-500">{a.observacoes}</p>
                  )}
                </div>
              </div>
              {a.status === 'agendado' && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-200/60 pt-2">
                  <button onClick={() => onAcao('converter', a)}
                    className="rounded bg-ouro-100 px-2 py-1 text-[11px] font-semibold text-ouro-700 hover:bg-ouro-200">
                    → Abrir OS agora
                  </button>
                  <button onClick={() => onEditar(a)}
                    className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200">
                    Editar
                  </button>
                  <button onClick={() => onAcao('cancelar', a)}
                    className="rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100">
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------
export default function Agenda() {
  const hoje = new Date();
  const [ref, setRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });
  const [dados, setDados] = useState([]);      // agendamentos do mês
  const [detalheDia, setDetalheDia] = useState({});  // { [YYYY-MM-DD]: [ag,ag] } populado sob demanda
  const [diaSelecionado, setDiaSelecionado] = useState(hojeISO());
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  const carregarMes = useCallback(() => {
    setCarregando(true); setErro('');
    api.agendamentos(ref)
      .then((r) => setDados(r.dados))
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [ref.ano, ref.mes]);

  const carregarDia = useCallback((diaISO) => {
    api.agendamentosDoDia(diaISO)
      .then((lista) => setDetalheDia((d) => ({ ...d, [diaISO]: lista })))
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { carregarMes(); }, [carregarMes]);
  useEffect(() => { if (diaSelecionado) carregarDia(diaSelecionado); }, [diaSelecionado, carregarDia]);

  // Indexa por dia pra desenhar as bolinhas no calendário
  const porDia = useMemo(() => {
    const m = {};
    for (const a of dados) {
      const d = isoDia(new Date(a.data_agendada));
      (m[d] = m[d] || []).push(a);
    }
    return m;
  }, [dados]);

  const grade = useMemo(() => gradeDoMes(ref.ano, ref.mes), [ref.ano, ref.mes]);
  const hojeStr = hojeISO();
  const eMesAtual = ref.ano === hoje.getFullYear() && ref.mes === hoje.getMonth() + 1;

  function mudarMes(delta) {
    setRef((r) => {
      let m = r.mes + delta, a = r.ano;
      if (m > 12) { m = 1; a += 1; }
      if (m < 1)  { m = 12; a -= 1; }
      return { ano: a, mes: m };
    });
  }

  async function acao(tipo, ag) {
    setErro('');
    try {
      if (tipo === 'cancelar') {
        if (!confirm(`Cancelar o agendamento de ${ag.cliente_nome} às ${horaDe(ag.data_agendada)}?`)) return;
        await api.cancelarAgendamento(ag.id);
      } else if (tipo === 'converter') {
        if (!confirm(`Abrir OS agora para ${ag.cliente_nome}? O agendamento será marcado como concluído.`)) return;
        await api.converterAgendamentoEmOS(ag.id);
      }
      carregarMes();
      carregarDia(diaSelecionado);
    } catch (e) { setErro(e.message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Agenda
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Marque um serviço pra um cliente/veículo e converta em OS quando o carro chegar.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditando(null); setFormAberto(true); }}>
          + Novo agendamento
        </button>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {/* Calendário + painel do dia lado a lado */}
      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        {/* Calendário */}
        <div className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button onClick={() => mudarMes(-1)}
                className="rounded border border-slate-300 px-2.5 py-1 text-slate-600 hover:bg-slate-100">◀</button>
              <h2 className="font-display text-lg font-semibold text-maninho-800">
                {nomeMes(ref.mes)} <span className="tnum text-slate-500">{ref.ano}</span>
              </h2>
              <button onClick={() => mudarMes(1)}
                className="rounded border border-slate-300 px-2.5 py-1 text-slate-600 hover:bg-slate-100">▶</button>
            </div>
            {!eMesAtual && (
              <button onClick={() => setRef({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 })}
                className="btn-ghost px-3 py-1 text-xs">Hoje</button>
            )}
          </div>

          {/* Cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {DIAS_SEM.map((d) => (
              <div key={d} className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {d}
              </div>
            ))}
          </div>

          {/* Grade dos dias */}
          {carregando && dados.length === 0 ? (
            <Skeleton className="h-[336px]" />
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {grade.map(({ data, ehDoMes }, i) => {
                const dISO = isoDia(data);
                const ags = porDia[dISO] || [];
                const pendentes = ags.filter((a) => a.status === 'agendado').length;
                const selecionado = dISO === diaSelecionado;
                const eHoje = dISO === hojeStr;

                return (
                  <button key={i} onClick={() => setDiaSelecionado(dISO)}
                    className={`flex h-14 flex-col items-center justify-start rounded-md p-1.5 text-sm transition
                      ${selecionado ? 'bg-maninho-600 text-white shadow-md'
                        : eHoje ? 'bg-ouro-100 text-ouro-800 ring-1 ring-ouro-300'
                        : ehDoMes ? 'text-slate-800 hover:bg-maninho-50'
                        : 'text-slate-300 hover:bg-slate-50'}`}>
                    <span className={`tnum ${selecionado ? 'font-bold' : ''}`}>
                      {data.getDate()}
                    </span>
                    {ags.length > 0 && (
                      <span className={`mt-1 flex items-center gap-0.5`}>
                        {pendentes > 0 && (
                          <span className={`h-1.5 w-1.5 rounded-full
                            ${selecionado ? 'bg-white' : 'bg-maninho-600'}`} />
                        )}
                        <span className={`text-[10px] font-semibold
                          ${selecionado ? 'text-white/90' : 'text-slate-500'}`}>
                          {ags.length}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-maninho-600" /> agendado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ouro-500" /> hoje
            </span>
            <span className="ml-auto text-slate-400">
              {dados.length} agendamento{dados.length === 1 ? '' : 's'} em {nomeMes(ref.mes)}
            </span>
          </div>
        </div>

        {/* Painel do dia */}
        <PainelDia dia={diaSelecionado}
          agendamentos={detalheDia[diaSelecionado] || []}
          onNovo={() => { setEditando(null); setFormAberto(true); }}
          onEditar={(a) => { setEditando(a); setFormAberto(true); }}
          onAcao={acao} />
      </div>

      <FormAgendamento aberto={formAberto} editando={editando}
        dataInicial={diaSelecionado}
        onFechar={() => setFormAberto(false)}
        onSalvo={() => {
          setFormAberto(false); setEditando(null);
          carregarMes(); carregarDia(diaSelecionado);
        }} />
    </div>
  );
}
