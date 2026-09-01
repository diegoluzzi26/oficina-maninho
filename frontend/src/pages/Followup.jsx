import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { data, telefone } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

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

function CardFollowup({ item, onAcao, onHistorico, enviando }) {
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

  return (
    <div className={`group relative rounded-md border border-slate-200 border-l-[3px] bg-white p-2.5 shadow-sm transition hover:-translate-y-px hover:shadow-md ${bordaTipo(item.tipo)}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chipTipo(item.tipo)}`}>
          {tipo?.emoji} {tipo?.label}
        </span>
        <span className="tnum text-[11px] font-medium text-slate-400">{tempo}</span>
      </div>
      <p className="text-sm font-semibold leading-tight text-slate-800">{item.cliente_nome}</p>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
        {item.placa && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700">
            {item.placa}
          </span>
        )}
        {(item.marca || item.modelo) && (
          <span className="truncate">{item.marca} {item.modelo}</span>
        )}
      </div>

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

// ------------------------------------------------------------------ Página

export default function Followup() {
  const usuario = getUser();
  const ehAdmin = usuario?.role === 'admin';
  const [dados, setDados] = useState(null);
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [enviandoId, setEnviandoId] = useState('');
  const [gerando, setGerando] = useState(false);
  const [enviandoTodos, setEnviandoTodos] = useState(false);
  const [historicoId, setHistoricoId] = useState(null);

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

  async function acao(item, tipo) {
    setErro('');
    try {
      if (tipo === 'enviar') {
        if (!item.cliente_telefone) { setErro('Cliente sem telefone'); return; }
        if (!confirm(`Enviar automático pelo Evolution pro ${item.cliente_telefone}?`)) return;
        setEnviandoId(item.id);
        await api.enviarFollowup(item.id);
      } else if (tipo === 'wa') {
        if (!item.cliente_telefone) { setErro('Cliente sem telefone'); return; }
        const num = String(item.cliente_telefone).replace(/\D/g, '');
        window.open(`https://wa.me/${num}?text=${encodeURIComponent(item.mensagem)}`, '_blank');
        setTimeout(() => {
          if (confirm('Mensagem enviada? Marcar como enviado?')) {
            api.followupMudarStatus(item.id, { status: 'enviado' }).then(carregar);
          }
        }, 400);
        return;
      } else if (tipo === 'respondeu') {
        await api.followupMudarStatus(item.id, { status: 'respondeu' });
      } else if (tipo === 'converteu') {
        await api.followupMudarStatus(item.id, { status: 'converteu' });
      } else if (tipo === 'dispensar') {
        await api.followupMudarStatus(item.id, { status: 'dispensado' });
      }
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setEnviandoId(''); }
  }

  async function gerar() {
    setGerando(true); setErro('');
    try {
      const r = await api.gerarFollowup();
      alert(`${r.gerados} follow-up(s) gerado(s)`);
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setGerando(false); }
  }

  async function enviarTodos() {
    if (!confirm('Enviar TODOS os follow-ups pendentes (agendados até hoje)?')) return;
    setEnviandoTodos(true); setErro('');
    try {
      const r = await api.enviarFollowupsPendentes();
      alert(`Enviados: ${r.enviados}/${r.total}` + (r.falhas.length ? `\nFalhas: ${r.falhas.length}` : ''));
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setEnviandoTodos(false); }
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
            Contato ativo com o cliente · Kanban por status
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ehAdmin && (
            <Link to="/followup/regras" className="btn-ghost">⚙ Regras</Link>
          )}
          {ehAdmin && (
            <button onClick={gerar} disabled={gerando} className="btn-primary">
              {gerando ? <><Spinner className="h-4 w-4" /> Gerando…</> : '⚡ Gerar fila'}
            </button>
          )}
          {ehAdmin && (
            <button onClick={enviarTodos} disabled={enviandoTodos} className="btn-ouro">
              {enviandoTodos ? <><Spinner className="h-4 w-4" /> Enviando…</> : '🚀 Enviar pendentes'}
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

      {/* Kanban */}
      {!dados ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {COLUNAS.map((c) => <Skeleton key={c.chave} className="h-64" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {COLUNAS.map((col) => {
            const cards = dados.colunas[col.chave] || [];
            return (
              <div key={col.chave} className="flex flex-col rounded-lg bg-slate-100/70 p-2">
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
                  <p className="rounded border border-dashed border-slate-300 py-6 text-center text-[11px] text-slate-400">
                    Sem itens
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {cards.map((item) => (
                      <CardFollowup key={item.id} item={item}
                        enviando={enviandoId}
                        onAcao={acao}
                        onHistorico={setHistoricoId} />
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
    </div>
  );
}
