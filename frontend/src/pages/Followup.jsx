import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { data, telefone } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner, Confirmar } from '../components/ui';

/**
 * Follow-up em Kanban.
 * 4 colunas por STATUS + chips coloridos por TIPO no topo.
 * Card de cada follow-up tem borda esquerda colorida do tipo e um
 * botão "Histórico" que abre modal com todas as interações do cliente.
 */

const TIPO_META = {
  manutencao: { emoji: '🔧', label: 'Manutenção', cor: 'azul' },
  reativacao: { emoji: '💤', label: 'Reativação', cor: 'ouro' },
  promocao:   { emoji: '📢', label: 'Promoção',   cor: 'verde' },
  avaliacao:  { emoji: '⭐', label: 'Avaliação',  cor: 'rosa' },
};

const COLUNAS = [
  { chave: 'a-fazer',     titulo: 'A fazer',             marcador: 'bg-slate-400' },
  { chave: 'enviado',     titulo: 'Enviado · Aguardando', marcador: 'bg-maninho-600' },
  { chave: 'em-conversa', titulo: 'Em conversa',         marcador: 'bg-ouro-500' },
  { chave: 'fechado',     titulo: 'Fechado',             marcador: 'bg-emerald-500' },
];

const EVENTO_META = {
  enviado:    { simbolo: '📤', bg: 'bg-maninho-100 text-maninho-700' },
  respondeu:  { simbolo: '💬', bg: 'bg-ouro-100 text-ouro-700' },
  converteu:  { simbolo: '✅', bg: 'bg-emerald-100 text-emerald-700' },
  dispensado: { simbolo: '✕',  bg: 'bg-slate-100 text-slate-500' },
  criado:     { simbolo: '⏱',  bg: 'bg-slate-100 text-slate-500' },
};

function bordaTipo(tipo) {
  const m = { azul: 'border-l-maninho-600', ouro: 'border-l-ouro-500',
    verde: 'border-l-emerald-500', rosa: 'border-l-rose-500' }[TIPO_META[tipo]?.cor];
  return m || 'border-l-slate-300';
}
function chipTipo(tipo) {
  const cor = TIPO_META[tipo]?.cor;
  return {
    azul:  'bg-maninho-50 text-maninho-700',
    ouro:  'bg-ouro-100 text-ouro-700',
    verde: 'bg-emerald-50 text-emerald-700',
    rosa:  'bg-rose-50 text-rose-700',
  }[cor] || 'bg-slate-100 text-slate-600';
}

function tempoRelativo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const dias = Math.round((hoje - d) / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias > 1) return `há ${dias} dias`;
  if (dias === -1) return 'amanhã';
  return `em ${-dias} dias`;
}

// ------------------------------------------------------------------ Modal Histórico

function ModalHistorico({ clienteId, onFechar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!clienteId) return;
    api.followupHistorico(clienteId)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [clienteId]);

  if (!clienteId) return null;

  return (
    <Modal aberto largura="max-w-lg"
      titulo={dados?.cliente ? `Histórico — ${dados.cliente.nome}` : 'Histórico'}
      onFechar={onFechar}>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {!dados ? (
        <Skeleton className="h-48" />
      ) : dados.historico.length === 0 ? (
        <Vazio titulo="Nenhum follow-up ainda"
          descricao="Esse cliente ainda não teve nenhum follow-up gerado." />
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {dados.historico.length} follow-up(s) registrado(s)
          </p>
          <ul className="space-y-2">
            {dados.historico.map((h) => {
              const evento = h.status === 'pendente' ? 'criado' : h.status;
              const meta = EVENTO_META[evento] || EVENTO_META.criado;
              const tipo = TIPO_META[h.tipo];
              const quando = h.respondido_em || h.enviado_em || h.criado_em;
              return (
                <li key={h.id} className="flex gap-3 rounded-md bg-slate-50 p-3">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm ${meta.bg}`}>
                    {meta.simbolo}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {tipo?.emoji} {tipo?.label} · {h.status}
                      </p>
                      {h.convertido_os_numero && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          OS #{h.convertido_os_numero}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {data(quando)} · {tempoRelativo(quando)}
                      {h.regra_nome && ` · ${h.regra_nome}`}
                    </p>
                    {h.mensagem && (
                      <p className="mt-1.5 whitespace-pre-wrap rounded bg-white p-2 text-xs text-slate-600">
                        {h.mensagem.slice(0, 160)}{h.mensagem.length > 160 ? '…' : ''}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ Card

// ------------------------------------------------------------------ Form Manual (com IA)

function FormManual({ aberto, onFechar, onCriado }) {
  const vazio = {
    cliente_id: '', tipo: 'promocao',
    mensagem: '',
    agendado_para: new Date().toISOString().slice(0, 10),
  };
  const [form, setForm] = useState(vazio);
  const [clientes, setClientes] = useState([]);
  const [buscaCli, setBuscaCli] = useState('');
  const [contextoIA, setContextoIA] = useState('');
  const [gerandoIA, setGerandoIA] = useState(false);
  const [iaConfigurada, setIaConfigurada] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setForm(vazio); setErro(''); setBuscaCli(''); setContextoIA('');
      api.iaStatus().then((s) => setIaConfigurada(s.configurada)).catch(() => {});
    }
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => {
      api.clientes({ busca: buscaCli, por_pagina: 20 })
        .then((r) => setClientes(r.dados))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [aberto, buscaCli]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const clienteSelecionado = clientes.find((c) => c.id === form.cliente_id);

  async function gerarComIA() {
    if (!clienteSelecionado) {
      setErro('Selecione o cliente antes de gerar');
      return;
    }
    setGerandoIA(true); setErro('');
    try {
      const r = await api.iaRedigir({
        tipo: form.tipo,
        cliente_nome: clienteSelecionado.nome,
        contexto: contextoIA || undefined,
      });
      setForm((f) => ({ ...f, mensagem: r.mensagem }));
    } catch (e) { setErro(e.message); }
    finally { setGerandoIA(false); }
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const r = await api.criarFollowupManual({
        cliente_id: form.cliente_id,
        tipo: form.tipo,
        mensagem: form.mensagem,
        agendado_para: form.agendado_para,
      });
      onCriado(r);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto={aberto} titulo="Follow-up manual" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Buscar cliente" obrigatorio>
          <input className="input" value={buscaCli}
            onChange={(e) => setBuscaCli(e.target.value)}
            placeholder="Nome, telefone, CPF ou placa" autoFocus />
          <select className="input mt-2" value={form.cliente_id}
            onChange={set('cliente_id')} required>
            <option value="">Selecione…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}{c.telefone ? ` · ${c.telefone}` : ''}
              </option>
            ))}
          </select>
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Tipo" obrigatorio>
            <select className="input" value={form.tipo} onChange={set('tipo')}>
              <option value="promocao">Promoção</option>
              <option value="manutencao">Manutenção</option>
              <option value="reativacao">Reativação</option>
              <option value="avaliacao">Avaliação</option>
              <option value="livre">Livre</option>
            </select>
          </Campo>
          <Campo label="Agendar para" obrigatorio>
            <input type="date" className="input" value={form.agendado_para}
              onChange={set('agendado_para')} required />
          </Campo>
        </div>

        {/* Bloco de IA — só se estiver configurada */}
        {iaConfigurada && (
          <div className="rounded-md border border-maninho-200 bg-maninho-50/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-maninho-700">
                ✨ Assistente de IA
              </p>
              <button type="button" onClick={gerarComIA} disabled={gerandoIA || !form.cliente_id}
                className="btn-primary px-3 py-1 text-xs">
                {gerandoIA ? <><Spinner className="h-3 w-3" /> Gerando…</> : '✨ Gerar mensagem'}
              </button>
            </div>
            <textarea className="input min-h-[50px] resize-y text-xs" value={contextoIA}
              onChange={(e) => setContextoIA(e.target.value)}
              placeholder="Contexto opcional pra IA (ex: 'promoção de ar-condicionado 20% off até fim do mês')" />
          </div>
        )}
        {!iaConfigurada && (
          <p className="text-[11px] text-slate-400">
            💡 Dica: configure a IA no <code>.env</code> pra ter um botão de gerar mensagem automática aqui.
          </p>
        )}

        <Campo label="Mensagem" obrigatorio>
          <textarea className="input min-h-[140px] resize-y" value={form.mensagem}
            onChange={set('mensagem')} required minLength={10} maxLength={2000}
            placeholder="Digite a mensagem que o cliente vai receber, ou use o botão ✨ acima…" />
        </Campo>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando || !form.cliente_id || !form.mensagem}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CardFollowup({ item, onAcao, onHistorico, enviando, onDragStart, onDragEnd }) {
  const tipo = TIPO_META[item.tipo];
  const coluna = {
    pendente: 'a-fazer', enviado: 'enviado',
    respondeu: 'em-conversa', converteu: 'fechado', dispensado: 'fechado',
  }[item.status];

  let tempo = '';
  if (item.status === 'pendente') tempo = tempoRelativo(item.agendado_para);
  else if (item.status === 'enviado')   tempo = `enviado ${tempoRelativo(item.enviado_em)}`;
  else if (item.status === 'respondeu') tempo = `respondeu ${tempoRelativo(item.respondido_em)}`;
  else if (item.status === 'converteu') tempo = `✅ converteu ${tempoRelativo(item.respondido_em || item.enviado_em)}`;
  else if (item.status === 'dispensado') tempo = '✕ dispensado';

  // Prévia da mensagem — 2 linhas
  const previa = (item.mensagem || '').replace(/\s+/g, ' ').trim();

  return (
    <div draggable
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={onDragEnd}
      className={`group relative cursor-grab rounded-md border border-slate-200 border-l-[3px] bg-white p-2.5 shadow-sm transition hover:-translate-y-px hover:shadow-md active:cursor-grabbing ${bordaTipo(item.tipo)}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chipTipo(item.tipo)}`}>
          {tipo?.emoji} {tipo?.label}
        </span>
        <span className="tnum text-[11px] font-medium text-slate-400">{tempo}</span>
      </div>
      <p className="text-sm font-semibold leading-tight text-slate-800">{item.cliente_nome}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        {item.placa && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">
            {item.placa}
          </span>
        )}
        {(item.marca || item.modelo) && (
          <span className="truncate">{item.marca} {item.modelo}</span>
        )}
      </div>
      {item.cliente_telefone && (
        <p className="tnum mt-1 font-mono text-[11px] font-semibold text-maninho-700">
          {telefone(item.cliente_telefone)}
        </p>
      )}
      {previa && (
        <p className="mt-1.5 line-clamp-2 rounded bg-slate-50 px-2 py-1 text-[11px] leading-snug text-slate-600">
          {previa}
        </p>
      )}

      {/* Ações contextuais por coluna — aparecem no hover */}
      <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 opacity-0 transition group-hover:opacity-100">
        {coluna === 'a-fazer' && (
          <>
            <button onClick={() => onAcao(item, 'enviar')} disabled={enviando === item.id}
              className="rounded px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">
              {enviando === item.id ? '⌛' : '🚀 Enviar'}
            </button>
            <button onClick={() => onAcao(item, 'wa')}
              className="rounded px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
              title="Abrir no WhatsApp Web">
              📱
            </button>
          </>
        )}
        {coluna === 'enviado' && (
          <>
            <button onClick={() => onAcao(item, 'respondeu')}
              className="rounded px-2 py-1 text-[11px] font-semibold text-ouro-700 hover:bg-ouro-50">
              💬 Respondeu
            </button>
            <button onClick={() => onAcao(item, 'dispensar')}
              className="rounded px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
              Dispensar
            </button>
          </>
        )}
        {coluna === 'em-conversa' && (
          <>
            <button onClick={() => onAcao(item, 'converteu')}
              className="rounded px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">
              ✅ Converteu
            </button>
            <button onClick={() => onAcao(item, 'dispensar')}
              className="rounded px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
              Dispensar
            </button>
          </>
        )}
        <button onClick={() => onHistorico(item.cliente_id)}
          className="ml-auto rounded px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
          Histórico
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Modal Envio em lote

/**
 * Revisão antes do disparo em lote. Lista os pendentes agendados até hoje
 * com checkbox por item — o admin desmarca quem não deve receber e só então
 * envia os selecionados. Quem está sem telefone aparece marcado em vermelho
 * e não pode ser selecionado.
 */
function ModalEnvioLote({ aberto, onFechar, onConcluido }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [itens, setItens] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!aberto) return;
    setItens(null); setErro(''); setResultado(null); setSel(new Set());
    api.followupFila({ status: 'pendente', ate: hoje, por_pagina: 100 })
      .then((r) => {
        setItens(r.dados);
        setSel(new Set(r.dados.filter((i) => i.cliente_telefone).map((i) => i.id)));
      })
      .catch((e) => setErro(e.message));
  }, [aberto]);

  const comTelefone = (itens || []).filter((i) => i.cliente_telefone);
  const todosMarcados = comTelefone.length > 0 && comTelefone.every((i) => sel.has(i.id));

  function toggle(id) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleTodos() {
    setSel(todosMarcados ? new Set() : new Set(comTelefone.map((i) => i.id)));
  }

  async function enviar() {
    const ids = [...sel];
    if (!ids.length) { setErro('Selecione ao menos um follow-up'); return; }
    setEnviando(true); setErro('');
    try {
      const r = await api.enviarFollowupsPendentes(ids);
      setResultado(r);
    } catch (e) { setErro(e.message); }
    finally { setEnviando(false); }
  }

  return (
    <Modal aberto={aberto} largura="max-w-xl" titulo="Enviar pendentes" onFechar={onFechar}>
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {resultado ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Enviados: <strong>{resultado.enviados}</strong> de {resultado.total}.
          </p>
          {resultado.falhas?.length > 0 && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700">
              <p className="mb-1 font-semibold">{resultado.falhas.length} falha(s):</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {resultado.falhas.map((f) => <li key={f.id}>{f.motivo}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-end border-t border-slate-200 pt-3">
            <button className="btn-primary" onClick={onConcluido}>Fechar</button>
          </div>
        </div>
      ) : itens === null ? (
        <Skeleton className="h-48" />
      ) : itens.length === 0 ? (
        <Vazio titulo="Nada pendente"
          descricao="Não há follow-ups agendados até hoje pra enviar." />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {itens.length} follow-up(s) agendado(s) até hoje. Revise e desmarque quem não deve receber.
          </p>
          <label className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} />
            Selecionar todos com telefone ({comTelefone.length})
          </label>
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {itens.map((i) => {
              const semTel = !i.cliente_telefone;
              return (
                <li key={i.id}
                  className={`flex gap-2.5 rounded-md border p-2.5 text-sm
                    ${semTel ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200'}`}>
                  <input type="checkbox" className="mt-0.5"
                    checked={sel.has(i.id)} disabled={semTel}
                    onChange={() => toggle(i.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-800">{i.cliente_nome}</span>
                      <span className="tnum text-[11px] text-slate-400">{data(i.agendado_para)}</span>
                    </div>
                    {semTel ? (
                      <p className="text-[11px] font-semibold text-rose-600">Sem telefone — não pode enviar</p>
                    ) : (
                      <p className="tnum font-mono text-[11px] text-maninho-700">{telefone(i.cliente_telefone)}</p>
                    )}
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                      {(i.mensagem || '').replace(/\s+/g, ' ').trim()}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
            <button type="button" className="btn-ouro" disabled={enviando || sel.size === 0} onClick={enviar}>
              {enviando ? <><Spinner className="h-4 w-4" /> Enviando…</> : `🚀 Enviar ${sel.size} selecionado(s)`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ Página

// Mapa: coluna do kanban → status pra mandar no PATCH quando dropar.
// "fechado" pergunta na hora se converteu ou dispensou (via confirm).
const COLUNA_PARA_STATUS = {
  'a-fazer':     'pendente',
  'enviado':     'enviado',
  'em-conversa': 'respondeu',
  'fechado':     'FECHADO_ESCOLHER', // marcador — a UI resolve
};

export default function Followup() {
  const usuario = getUser();
  const ehAdmin = usuario?.role === 'admin';
  const [dados, setDados] = useState(null);
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [confirmacao, setConfirmacao] = useState(null);
  const [enviandoId, setEnviandoId] = useState('');
  const [gerando, setGerando] = useState(false);
  const [loteAberto, setLoteAberto] = useState(false);
  const [historicoId, setHistoricoId] = useState(null);
  const [manualAberto, setManualAberto] = useState(false);
  // Drag & drop
  const [arrastando, setArrastando] = useState(null); // item sendo arrastado
  const [colunaAlvo, setColunaAlvo] = useState(null); // qual coluna está sob o cursor

  const carregar = useCallback(() => {
    setErro('');
    const params = {};
    if (tipoFiltro !== 'todos') params.tipo = tipoFiltro;
    if (busca) params.busca = busca;
    api.followupKanban(params)
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, [tipoFiltro, busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  // ---------- Drag & drop ----------------------------------------
  function onDragStart(e, item) {
    setArrastando(item);
    e.dataTransfer.effectAllowed = 'move';
    // Requer setData pro Firefox iniciar o drag
    e.dataTransfer.setData('text/plain', item.id);
  }
  function onDragEnd() {
    setArrastando(null);
    setColunaAlvo(null);
  }
  function onDragOverColuna(e, colunaChave) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (colunaAlvo !== colunaChave) setColunaAlvo(colunaChave);
  }
  async function onDropColuna(e, colunaChave) {
    e.preventDefault();
    setColunaAlvo(null);
    const item = arrastando;
    setArrastando(null);
    if (!item) return;

    // Se soltou na mesma coluna, nada a fazer
    const colunaAtual = {
      pendente: 'a-fazer', enviado: 'enviado',
      respondeu: 'em-conversa', converteu: 'fechado', dispensado: 'fechado',
    }[item.status];
    if (colunaAtual === colunaChave) return;

    const novoStatus = COLUNA_PARA_STATUS[colunaChave];
    // Fechado: pergunta se converteu ou dispensou (três botões).
    if (novoStatus === 'FECHADO_ESCOLHER') {
      setConfirmacao({
        titulo: `Fechar follow-up — ${item.cliente_nome}`,
        mensagem: 'Como este follow-up terminou?',
        acoes: (fechar) => (
          <>
            <button className="btn-ghost" onClick={fechar}>Cancelar</button>
            <button className="btn bg-slate-200 text-slate-700 hover:bg-slate-300"
              onClick={() => { fechar(); mudarStatusItem(item.id, 'dispensado'); }}>
              ✕ Dispensou
            </button>
            <button className="btn-primary"
              onClick={() => { fechar(); mudarStatusItem(item.id, 'converteu'); }}>
              ✅ Converteu
            </button>
          </>
        ),
      });
      return;
    }
    mudarStatusItem(item.id, novoStatus);
  }

  async function mudarStatusItem(id, status) {
    setErro('');
    try {
      await api.followupMudarStatus(id, { status });
      carregar();
    } catch (err) { setErro(err.message); }
  }

  async function enviarItem(item) {
    setEnviandoId(item.id); setErro('');
    try {
      await api.enviarFollowup(item.id);
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setEnviandoId(''); }
  }

  function acao(item, tipo) {
    setErro('');
    if (tipo === 'enviar') {
      if (!item.cliente_telefone) { setErro('Cliente sem telefone'); return; }
      setConfirmacao({
        titulo: 'Enviar follow-up',
        mensagem: `Enviar a mensagem automaticamente pelo WhatsApp para `
          + `${item.cliente_nome} (${telefone(item.cliente_telefone)})?`,
        rotulo: '🚀 Enviar',
        onConfirmar: () => enviarItem(item),
      });
      return;
    }
    if (tipo === 'wa') {
      if (!item.cliente_telefone) { setErro('Cliente sem telefone'); return; }
      const num = String(item.cliente_telefone).replace(/\D/g, '');
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(item.mensagem)}`, '_blank');
      setConfirmacao({
        titulo: 'Marcar como enviado?',
        mensagem: 'Abrimos o WhatsApp numa nova aba. Depois de enviar a mensagem por lá, '
          + 'marque este follow-up como enviado.',
        rotulo: 'Marcar como enviado',
        onConfirmar: () => mudarStatusItem(item.id, 'enviado'),
      });
      return;
    }
    if (tipo === 'respondeu')  mudarStatusItem(item.id, 'respondeu');
    else if (tipo === 'converteu') mudarStatusItem(item.id, 'converteu');
    else if (tipo === 'dispensar') mudarStatusItem(item.id, 'dispensado');
  }

  async function gerar() {
    setGerando(true); setErro(''); setMsgOk('');
    try {
      const r = await api.gerarFollowup();
      setMsgOk(`${r.gerados} follow-up(s) gerado(s).`);
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setGerando(false); }
  }

  const c = dados?.contagens || { todos: 0, manutencao: 0, reativacao: 0, promocao: 0, avaliacao: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Follow-up
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Arraste os cards entre colunas pra mudar o status
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setManualAberto(true)} className="btn-ghost">
            + Manual
          </button>
          {ehAdmin && (
            <Link to="/followup/regras" className="btn-ghost">⚙ Regras</Link>
          )}
          {ehAdmin && (
            <button onClick={gerar} disabled={gerando} className="btn-primary">
              {gerando ? <><Spinner className="h-4 w-4" /> Gerando…</> : '⚡ Gerar fila'}
            </button>
          )}
          {ehAdmin && (
            <button onClick={() => setLoteAberto(true)} className="btn-ouro">
              🚀 Enviar pendentes
            </button>
          )}
        </div>
      </div>

      {/* Chips de filtro por tipo */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          ['todos',      'Todos',        ''],
          ['manutencao', 'Manutenção',   '🔧'],
          ['reativacao', 'Reativação',   '💤'],
          ['promocao',   'Promoção',     '📢'],
          ['avaliacao',  'Avaliação',    '⭐'],
        ].map(([k, label, emoji]) => (
          <button key={k} onClick={() => setTipoFiltro(k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition
              ${tipoFiltro === k
                ? (k === 'todos' ? 'border-slate-800 bg-slate-800 text-white'
                   : k === 'manutencao' ? 'border-maninho-600 bg-maninho-50 text-maninho-700'
                   : k === 'reativacao' ? 'border-ouro-500 bg-ouro-100 text-ouro-700'
                   : k === 'promocao'   ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                   : 'border-rose-500 bg-rose-50 text-rose-700')
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>
            <span>{emoji} {label}</span>
            <span className={`tnum rounded px-1.5 py-0.5 text-[10px] font-bold
              ${tipoFiltro === k ? 'bg-black/15' : 'bg-slate-100'}`}>
              {c[k] || 0}
            </span>
          </button>
        ))}
        <input className="input ml-auto max-w-xs" placeholder="Buscar cliente ou placa…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {msgOk && <Alerta tipo="ok" onFechar={() => setMsgOk('')}>{msgOk}</Alerta>}

      {/* Kanban */}
      {!dados ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {COLUNAS.map((c) => <Skeleton key={c.chave} className="h-64" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {COLUNAS.map((col) => {
            const cards = dados.colunas[col.chave] || [];
            const alvo = colunaAlvo === col.chave;
            return (
              <div key={col.chave}
                onDragOver={(e) => onDragOverColuna(e, col.chave)}
                onDragLeave={() => colunaAlvo === col.chave && setColunaAlvo(null)}
                onDrop={(e) => onDropColuna(e, col.chave)}
                className={`flex flex-col rounded-lg p-2 transition
                  ${alvo
                    ? 'bg-maninho-100 ring-2 ring-maninho-500'
                    : 'bg-slate-100/70'}`}>
                <div className="mb-2 flex items-center justify-between border-b border-slate-200 px-1 pb-2">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.marcador}`} />
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      {col.titulo}
                    </p>
                  </div>
                  <span className="tnum rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">
                    {cards.length}
                  </span>
                </div>

                {cards.length === 0 ? (
                  <p className={`rounded border border-dashed py-6 text-center text-[11px]
                    ${alvo ? 'border-maninho-500 text-maninho-700' : 'border-slate-300 text-slate-400'}`}>
                    {alvo ? 'Solte aqui' : 'Sem itens'}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {cards.map((item) => (
                      <CardFollowup key={item.id} item={item}
                        enviando={enviandoId}
                        onAcao={acao}
                        onHistorico={setHistoricoId}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {historicoId && (
        <ModalHistorico clienteId={historicoId} onFechar={() => setHistoricoId(null)} />
      )}

      <FormManual aberto={manualAberto} onFechar={() => setManualAberto(false)}
        onCriado={() => { setManualAberto(false); carregar(); }} />

      <ModalEnvioLote aberto={loteAberto} onFechar={() => setLoteAberto(false)}
        onConcluido={() => { setLoteAberto(false); carregar(); }} />

      <Confirmar dados={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
}
