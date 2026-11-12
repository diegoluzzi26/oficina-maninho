import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wrench, RotateCcw, Megaphone, Star, MessageSquareText, Send, MessageCircle,
  History, Check, X, Plus, RefreshCw, Search, Loader2, MoreHorizontal, Trash2, PhoneOff,
  ArrowDownUp, ListChecks,
} from 'lucide-react';
import { api, getUser } from '../lib/api';
import { data, telefone } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner, Confirmar } from '../components/ui';
import Automacoes from './followup/Automacoes';
import Revisoes from './followup/Revisoes';
import Resultados from './followup/Resultados';

/**
 * Follow-up em Kanban.
 *
 * A tela responde "quem eu chamo hoje?". O topo de cada coluna é um funil
 * (número grande + o que ele significa); os cards ficam neutros e a única
 * cor forte é a de atraso. "Para enviar" vem separado por urgência.
 */

const TIPO_META = {
  manutencao: { Icone: Wrench,            label: 'Manutenção' },
  reativacao: { Icone: RotateCcw,         label: 'Reativação' },
  promocao:   { Icone: Megaphone,         label: 'Promoção' },
  avaliacao:  { Icone: Star,              label: 'Avaliação' },
  livre:      { Icone: MessageSquareText, label: 'Livre' },
};

const COLUNAS = [
  { chave: 'a-fazer',     titulo: 'Para enviar' },
  { chave: 'enviado',     titulo: 'Aguardando resposta' },
  { chave: 'em-conversa', titulo: 'Em conversa' },
  { chave: 'fechado',     titulo: 'Fechados' },
];

const COLUNA_DO_STATUS = {
  pendente: 'a-fazer', enviado: 'enviado',
  respondeu: 'em-conversa', converteu: 'fechado', dispensado: 'fechado',
};

const EVENTO_META = {
  enviado:    { Icone: Send,          bg: 'bg-maninho-100 text-maninho-700' },
  respondeu:  { Icone: MessageCircle, bg: 'bg-ouro-100 text-ouro-700' },
  converteu:  { Icone: Check,         bg: 'bg-emerald-100 text-emerald-700' },
  dispensado: { Icone: X,             bg: 'bg-slate-100 text-slate-500' },
  criado:     { Icone: History,       bg: 'bg-slate-100 text-slate-500' },
};

const ROTULO_STATUS = {
  pendente: 'pendente', enviado: 'enviado', respondeu: 'respondeu',
  converteu: 'virou serviço', dispensado: 'dispensado',
};

function diasAte(iso) {
  if (!iso) return 0;
  const alvo = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

function tempoRelativo(iso) {
  if (!iso) return '';
  const dias = Math.round((new Date() - new Date(iso)) / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias > 1) return `há ${dias} dias`;
  if (dias === -1) return 'amanhã';
  return `em ${-dias} dias`;
}

/** Urgência de um pendente pelo dia agendado. */
function urgencia(item) {
  const d = diasAte(item.agendado_para);
  if (d < 0) return { grupo: 'atrasados', texto: d === -1 ? 'atrasado 1 dia' : `atrasado ${-d} dias` };
  if (d === 0) return { grupo: 'hoje', texto: 'hoje' };
  return { grupo: 'proximos', texto: d === 1 ? 'amanhã' : `em ${d} dias` };
}

const GRUPOS_PENDENTES = [
  { chave: 'atrasados', titulo: 'Atrasados' },
  { chave: 'hoje',      titulo: 'Para hoje' },
  { chave: 'proximos',  titulo: 'Próximos dias' },
];

/** Tipo do follow-up; com automação, mostra o nome dela. */
function TipoTag({ tipo, nome }) {
  const m = TIPO_META[tipo] || TIPO_META.livre;
  const { Icone } = m;
  return (
    <span className="inline-flex max-w-[11rem] items-center gap-1 text-[11px] font-medium text-slate-500" title={nome || m.label}>
      <Icone className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span className="truncate">{nome || m.label}</span>
    </span>
  );
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
              const tipo = TIPO_META[h.tipo] || TIPO_META.livre;
              const quando = h.respondido_em || h.enviado_em || h.criado_em;
              const { Icone } = meta;
              return (
                <li key={h.id} className="flex gap-3 rounded-md bg-slate-50 p-3">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${meta.bg}`}>
                    <Icone className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {tipo.label}: {ROTULO_STATUS[h.status] || h.status}
                      </p>
                      {h.convertido_os_numero && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          OS #{h.convertido_os_numero}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {data(quando)} ({tempoRelativo(quando)})
                      {h.regra_nome && `, regra “${h.regra_nome}”`}
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
  const [sugerindo, setSugerindo] = useState(false);
  const [melhorando, setMelhorando] = useState(false);
  const [justificativa, setJustificativa] = useState('');
  const [iaConfigurada, setIaConfigurada] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setForm(vazio); setErro(''); setBuscaCli(''); setContextoIA(''); setJustificativa('');
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

  // Deixa a IA olhar o histórico e sugerir TUDO: tipo, data e mensagem.
  async function sugerirCompleto() {
    if (!form.cliente_id) { setErro('Selecione o cliente antes de sugerir'); return; }
    setSugerindo(true); setErro(''); setJustificativa('');
    try {
      const r = await api.iaSugerirFollowup(form.cliente_id);
      setForm((f) => ({
        ...f, tipo: r.tipo, agendado_para: r.agendado_para, mensagem: r.mensagem,
      }));
      setJustificativa(r.justificativa);
    } catch (e) { setErro(e.message); }
    finally { setSugerindo(false); }
  }

  // Reescreve a mensagem atual preservando as variáveis {…}.
  async function melhorar() {
    if (!form.mensagem.trim()) { setErro('Escreva ou gere uma mensagem antes de melhorar'); return; }
    setMelhorando(true); setErro('');
    try {
      const r = await api.iaMelhorarMensagem({
        texto: form.mensagem, tipo: form.tipo, contexto: contextoIA || undefined,
      });
      setForm((f) => ({ ...f, mensagem: r.mensagem }));
    } catch (e) { setErro(e.message); }
    finally { setMelhorando(false); }
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-maninho-700">
                ✨ Assistente de IA
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={sugerirCompleto} disabled={sugerindo || !form.cliente_id}
                  className="btn-primary px-3 py-1 text-xs"
                  title="A IA olha o histórico do cliente e sugere tipo, data e mensagem">
                  {sugerindo ? <><Spinner className="h-3 w-3" /> Analisando…</> : '🔮 Sugerir follow-up'}
                </button>
                <button type="button" onClick={gerarComIA} disabled={gerandoIA || !form.cliente_id}
                  className="btn-ghost px-3 py-1 text-xs"
                  title="Gera só a mensagem, com o tipo e o contexto escolhidos">
                  {gerandoIA ? <><Spinner className="h-3 w-3" /> Gerando…</> : '✨ Só a mensagem'}
                </button>
              </div>
            </div>
            <textarea className="input min-h-[50px] resize-y text-xs" value={contextoIA}
              onChange={(e) => setContextoIA(e.target.value)}
              placeholder="Contexto opcional pra IA (ex: 'promoção de ar-condicionado 20% off até fim do mês')" />
            {justificativa && (
              <p className="mt-2 text-[11px] text-maninho-700">
                💡 <span className="italic">{justificativa}</span>
              </p>
            )}
          </div>
        )}
        {!iaConfigurada && (
          <p className="text-[11px] text-slate-400">
            💡 Dica: configure a IA no <code>.env</code> pra ter um botão de gerar mensagem automática aqui.
          </p>
        )}

        <Campo label="Mensagem" obrigatorio>
          {iaConfigurada && form.mensagem.trim() && (
            <div className="mb-1 flex justify-end">
              <button type="button" onClick={melhorar} disabled={melhorando}
                className="btn-ghost px-2 py-0.5 text-[11px]"
                title="Reescreve a mensagem atual com um tom melhor">
                {melhorando ? <><Spinner className="h-3 w-3" /> Melhorando…</> : '✨ Melhorar texto'}
              </button>
            </div>
          )}
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

// ------------------------------------------------------------------ Card

const BTN_ICONE = 'grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500';
const BTN_TEXTO = 'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500 disabled:opacity-50';

/** Pendente que não tem como sair: sem telefone, sem WhatsApp ou envio que falhou. */
function problemaDo(item) {
  if (item.status !== 'pendente') return null;
  if (!item.cliente_telefone) return { titulo: 'Sem telefone', motivo: 'Cliente sem telefone no cadastro.' };
  if (item.problema === 'sem_whatsapp') return { titulo: 'Sem WhatsApp', motivo: 'Este número não tem WhatsApp.' };
  if (item.problema === 'falha_envio') {
    const motivo = String(item.problema_motivo || 'O envio falhou.').replace(/^Falha ao enviar WhatsApp:\s*/i, '');
    return {
      titulo: /não tem WhatsApp/i.test(motivo) ? 'Sem WhatsApp' : 'Envio falhou',
      motivo: motivo.charAt(0).toUpperCase() + motivo.slice(1),
    };
  }
  return null;
}

/** Data que vale para ordenar: quando o card chegou na coluna em que está. */
function dataDoCard(item) {
  if (item.status === 'respondeu') return item.respondido_em || item.enviado_em || item.criado_em;
  if (item.status === 'enviado') return item.enviado_em || item.criado_em;
  if (item.status === 'converteu' || item.status === 'dispensado') {
    return item.respondido_em || item.enviado_em || item.criado_em;
  }
  return item.criado_em;
}

/** Menu "mais ações" do card. Fecha com clique fora ou Esc. */
function MenuCard({ itens, rotulo }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const visiveis = itens.filter(Boolean);
  if (!visiveis.length) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={BTN_ICONE} aria-haspopup="menu" aria-expanded={aberto}
        aria-label={rotulo} title="Mais ações" onClick={() => setAberto((v) => !v)}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-8 z-20 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {visiveis.map(({ rotulo: r, Icone, onClick, perigo }) => (
            <button key={r} type="button" role="menuitem"
              onClick={() => { setAberto(false); onClick(); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition
                ${perigo ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}>
              <Icone className="h-4 w-4" aria-hidden="true" /> {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Selecao({ marcado, onChange, nome }) {
  return (
    <input type="checkbox" checked={marcado} onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Selecionar ${nome}`}
      className="h-4 w-4 shrink-0 cursor-pointer rounded accent-maninho-600" />
  );
}

function CardFollowup({ item, onAcao, onHistorico, enviando, onDragStart, onDragEnd, ehAdmin, selecionando, marcado, onMarcar }) {
  const coluna = COLUNA_DO_STATUS[item.status];
  // Pendente com envio iniciado: a mensagem foi entregue à Evolution e o
  // sistema está confirmando se saiu. Não pode ser enviado de novo.
  const conferindo = item.status === 'pendente' && !!item.envio_iniciado_em;
  const urg = item.status === 'pendente' ? urgencia(item) : null;
  const atrasado = urg?.grupo === 'atrasados';
  const problema = conferindo ? null : problemaDo(item);

  let quando = '';
  if (conferindo) quando = 'enviando…';
  else if (urg) quando = urg.texto;
  else if (item.status === 'enviado')   quando = `enviado ${tempoRelativo(item.enviado_em)}`;
  else if (item.status === 'respondeu') quando = `respondeu ${tempoRelativo(item.respondido_em)}`;

  const previa = (item.mensagem || '').replace(/\s+/g, ' ').trim();
  const carro = [item.marca, item.modelo].filter(Boolean).join(' ');
  const borda = problema ? 'border-l-rose-500' : atrasado ? 'border-l-ouro-500' : 'border-l-transparent';

  const menu = [
    coluna === 'a-fazer' && !conferindo && item.cliente_telefone && {
      rotulo: 'Abrir no WhatsApp', Icone: MessageCircle, onClick: () => onAcao(item, 'wa'),
    },
    { rotulo: 'Histórico do cliente', Icone: History, onClick: () => onHistorico(item.cliente_id) },
    !conferindo && ['pendente', 'enviado', 'respondeu'].includes(item.status) && {
      rotulo: 'Dispensar', Icone: X, onClick: () => onAcao(item, 'dispensar'),
    },
    ehAdmin && !conferindo && { rotulo: 'Excluir card', Icone: Trash2, onClick: () => onAcao(item, 'excluir'), perigo: true },
  ];

  return (
    <article draggable={!selecionando}
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={onDragEnd}
      onClick={selecionando ? onMarcar : undefined}
      className={`rounded-lg border border-l-[3px] bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition
        ${selecionando ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
        ${marcado ? 'border-maninho-500 ring-2 ring-maninho-200' : 'border-slate-200'} ${borda}`}>
      <header className="flex items-start gap-2">
        {selecionando && <Selecao marcado={marcado} onChange={onMarcar} nome={item.cliente_nome} />}
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight text-slate-800">
          {item.cliente_nome}
        </h3>
        <span className={`shrink-0 text-[11px] font-semibold tabular-nums
          ${atrasado ? 'text-ouro-600' : conferindo ? 'text-maninho-700' : 'text-slate-400'}`}>
          {conferindo && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" />}
          {quando}
        </span>
      </header>

      <p className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
        {item.placa && (
          <span className="rounded border border-slate-300 px-1 font-mono text-[11px] font-semibold tracking-wide text-slate-700">
            {item.placa}
          </span>
        )}
        {carro && <span className="truncate">{carro}</span>}
      </p>

      {previa && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{previa}</p>
      )}

      {problema && (
        <div className="mt-2.5 flex items-start gap-2 rounded-md bg-rose-50 px-2.5 py-2 text-xs text-rose-800">
          <PhoneOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1"><span className="font-semibold">{problema.titulo}.</span> {problema.motivo}</p>
        </div>
      )}

      <footer className="mt-2.5 flex items-center gap-1">
        <span className="mr-auto min-w-0"><TipoTag tipo={item.tipo} nome={item.regra_nome} /></span>
        {!selecionando && (<>
          {coluna === 'a-fazer' && !conferindo && (problema ? (
            ehAdmin && (
              <button type="button" onClick={() => onAcao(item, 'excluir')}
                className={`${BTN_TEXTO} border border-rose-200 text-rose-700 hover:bg-rose-50`}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
            )
          ) : (
            <button type="button" onClick={() => onAcao(item, 'enviar')} disabled={enviando === item.id}
              title={`Enviar para ${telefone(item.cliente_telefone)}`}
              className={`${BTN_TEXTO} bg-ouro-500 text-white hover:bg-ouro-600`}>
              {enviando === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Enviar
            </button>
          ))}
          {coluna === 'enviado' && (
            <button type="button" onClick={() => onAcao(item, 'respondeu')}
              className={`${BTN_TEXTO} border border-slate-200 text-slate-700 hover:bg-slate-50`}>
              <MessageCircle className="h-3.5 w-3.5" /> Respondeu
            </button>
          )}
          {coluna === 'em-conversa' && (
            <button type="button" onClick={() => onAcao(item, 'converteu')}
              className={`${BTN_TEXTO} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <Check className="h-3.5 w-3.5" /> Virou serviço
            </button>
          )}
          <MenuCard itens={menu} rotulo={`Mais ações para ${item.cliente_nome}`} />
        </>)}
      </footer>
    </article>
  );
}

/** Linha compacta da coluna Fechados: só quem, como terminou e quando. */
function LinhaFechada({ item, onHistorico, onDragStart, onDragEnd, onAcao, ehAdmin, selecionando, marcado, onMarcar }) {
  const converteu = item.status === 'converteu';
  return (
    <li draggable={!selecionando}
      onDragStart={(e) => onDragStart(e, item)}
      onDragEnd={onDragEnd}
      onClick={selecionando ? onMarcar : undefined}
      className={`flex items-center gap-2.5 py-2 ${selecionando ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}>
      {selecionando ? (
        <Selecao marcado={marcado} onChange={onMarcar} nome={item.cliente_nome} />
      ) : (
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full
          ${converteu ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
          title={converteu ? 'Virou serviço' : 'Dispensado'}>
          {converteu ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700">{item.cliente_nome}</p>
        <p className="text-[11px] text-slate-400">
          {converteu ? 'virou serviço' : 'dispensado'} {tempoRelativo(dataDoCard(item))}
        </p>
      </div>
      {!selecionando && (
        <MenuCard rotulo={`Mais ações para ${item.cliente_nome}`} itens={[
          { rotulo: 'Histórico do cliente', Icone: History, onClick: () => onHistorico(item.cliente_id) },
          ehAdmin && { rotulo: 'Excluir card', Icone: Trash2, onClick: () => onAcao(item, 'excluir'), perigo: true },
        ]} />
      )}
    </li>
  );
}

// ------------------------------------------------------------------ Modal Envio em lote

/**
 * Revisão antes do disparo em lote. Lista os pendentes agendados até hoje
 * com checkbox por item — o admin desmarca quem não deve receber e só então
 * envia os selecionados. Quem está sem telefone aparece marcado em vermelho
 * e não pode ser selecionado; quem já está "enviando" fica de fora.
 *
 * O envio roda no servidor, em segundo plano e com intervalo entre as
 * mensagens: o modal só acompanha o progresso e pode ser fechado.
 */
function ModalEnvioLote({ aberto, onFechar }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [itens, setItens] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [erro, setErro] = useState('');
  const [iniciando, setIniciando] = useState(false);
  const [lote, setLote] = useState(null); // estado do lote no servidor
  const [regras, setRegras] = useState([]);
  const [regraSel, setRegraSel] = useState(''); // '' = todas as regras
  const [conferindo, setConferindo] = useState(false);
  const [conferencia, setConferencia] = useState(null);

  // Ao abrir: reseta, carrega regras e vê se já há lote rodando.
  useEffect(() => {
    if (!aberto) return;
    setRegraSel(''); setLote(null); setConferencia(null); setErro('');
    api.followupRegras().then(setRegras).catch(() => {});
    api.followupEnvioLote()
      .then((e) => { if (e?.em_andamento) setLote(e); })
      .catch(() => {});
  }, [aberto]);

  // Acompanha o lote enquanto estiver rodando.
  useEffect(() => {
    if (!aberto || !lote?.em_andamento) return undefined;
    const t = setInterval(() => {
      api.followupEnvioLote().then((e) => e && setLote(e)).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [aberto, lote?.em_andamento]);

  // Carrega os pendentes (recarrega quando a regra muda ou após conferir).
  const carregarItens = useCallback(() => {
    setItens(null); setSel(new Set());
    api.followupFila({
      status: 'pendente', ate: hoje, por_pagina: 100,
      ...(regraSel ? { regra_id: regraSel } : {}),
    })
      .then((r) => {
        setItens(r.dados);
        setSel(new Set(r.dados
          .filter((i) => i.cliente_telefone && !i.envio_iniciado_em)
          .map((i) => i.id)));
      })
      .catch((e) => setErro(e.message));
  }, [regraSel, hoje]);

  useEffect(() => { if (aberto) carregarItens(); }, [aberto, carregarItens]);

  const disponiveis = (itens || []).filter((i) => i.cliente_telefone && !i.envio_iniciado_em);
  const todosMarcados = disponiveis.length > 0 && disponiveis.every((i) => sel.has(i.id));

  function toggle(id) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleTodos() {
    setSel(todosMarcados ? new Set() : new Set(disponiveis.map((i) => i.id)));
  }

  async function enviar() {
    const ids = [...sel];
    if (!ids.length) { setErro('Selecione ao menos um follow-up'); return; }
    setIniciando(true); setErro('');
    try {
      setLote(await api.enviarFollowupsPendentes(ids, regraSel || undefined));
    } catch (e) { setErro(e.message); }
    finally { setIniciando(false); }
  }

  async function conferir() {
    setConferindo(true); setErro(''); setConferencia(null);
    try {
      setConferencia(await api.conferirEnviosFollowup(true));
      carregarItens();
    } catch (e) { setErro(e.message); }
    finally { setConferindo(false); }
  }

  const minutosEstimados = Math.max(1, Math.ceil(sel.size * 12.5 / 60));

  return (
    <Modal aberto={aberto} largura="max-w-xl" titulo="Enviar pendentes" onFechar={onFechar}>
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {lote ? (
        <div className="space-y-3">
          {lote.em_andamento ? (
            <>
              <p className="text-sm text-slate-700">
                Enviando <strong>{lote.processados}</strong> de {lote.total}…
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-ouro-500 transition-all"
                  style={{ width: `${lote.total ? (lote.processados / lote.total) * 100 : 0}%` }} />
              </div>
              <p className="text-xs text-slate-500">
                As mensagens saem uma por vez, com intervalo, para o WhatsApp não bloquear o número.
                Pode fechar esta janela: o envio continua no servidor.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-700">
              Concluído: <strong>{lote.enviados}</strong> de {lote.total} enviado(s).
            </p>
          )}
          {lote.incertos > 0 && (
            <p className="rounded-md bg-ouro-100 p-3 text-xs text-ouro-700">
              {lote.incertos} mensagem(ns) demoraram para ser confirmadas pelo WhatsApp. Elas
              ficam como “enviando…” e o sistema confere sozinho em alguns minutos. Não reenvie.
            </p>
          )}
          {lote.falhas?.length > 0 && (
            <div className="rounded-md bg-rose-50 p-3 text-xs text-rose-700">
              <p className="mb-1 font-semibold">{lote.falhas.length} falha(s), continuam pendentes:</p>
              <ul className="list-disc space-y-0.5 pl-4">
                {lote.falhas.map((f) => <li key={f.id}>{f.cliente ? `${f.cliente}: ` : ''}{f.motivo}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-end border-t border-slate-200 pt-3">
            <button className="btn-primary" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      ) : (
        <>
          <label className="mb-3 flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Regra
            <select className="input" value={regraSel}
              onChange={(e) => setRegraSel(e.target.value)} disabled={iniciando}>
              <option value="">Todas as regras</option>
              {regras.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
            <span>Já mandou e ficou como pendente? Confira no WhatsApp antes de reenviar.</span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs"
              onClick={conferir} disabled={conferindo}>
              {conferindo ? <><Spinner className="h-3 w-3" /> Conferindo…</> : '🔎 Conferir no WhatsApp'}
            </button>
            {conferencia && (
              <p className="w-full font-semibold text-slate-700">
                {conferencia.confirmados} de {conferencia.conferidos} já tinham sido enviados e foram
                marcados como enviados.
                {conferencia.erros > 0 && ` ${conferencia.erros} não puderam ser conferidos (WhatsApp indisponível).`}
              </p>
            )}
          </div>

          {itens === null ? (
            <Skeleton className="h-48" />
          ) : itens.length === 0 ? (
            <Vazio titulo="Nada pendente"
              descricao={regraSel
                ? 'Nenhum follow-up desta regra agendado até hoje pra enviar.'
                : 'Não há follow-ups agendados até hoje pra enviar.'} />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                {itens.length} follow-up(s) agendado(s) até hoje. Revise e desmarque quem não deve receber.
              </p>
              <label className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={todosMarcados} onChange={toggleTodos} />
                Selecionar todos que podem receber ({disponiveis.length})
              </label>
              <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">
                {itens.map((i) => {
                  const semTel = !i.cliente_telefone;
                  const enviando = !!i.envio_iniciado_em;
                  const bloqueado = semTel || enviando;
                  return (
                    <li key={i.id}
                      className={`flex gap-2.5 rounded-md border p-2.5 text-sm
                        ${semTel ? 'border-rose-200 bg-rose-50/40' : enviando ? 'border-ouro-200 bg-ouro-50/40' : 'border-slate-200'}`}>
                      <input type="checkbox" className="mt-0.5"
                        checked={sel.has(i.id)} disabled={bloqueado}
                        onChange={() => toggle(i.id)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-slate-800">{i.cliente_nome}</span>
                          <span className="tnum text-[11px] text-slate-400">{data(i.agendado_para)}</span>
                        </div>
                        {semTel ? (
                          <p className="text-[11px] font-semibold text-rose-600">Sem telefone — não pode enviar</p>
                        ) : enviando ? (
                          <p className="text-[11px] font-semibold text-ouro-700">Enviando… aguardando confirmação</p>
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
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
                {sel.size > 0 && (
                  <span className="mr-auto text-[11px] text-slate-500">
                    Leva cerca de {minutosEstimados} min (uma mensagem a cada ~10s).
                  </span>
                )}
                <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
                <button type="button" className="btn-ouro" disabled={iniciando || sel.size === 0} onClick={enviar}>
                  {iniciando ? <><Spinner className="h-4 w-4" /> Iniciando…</> : `🚀 Enviar ${sel.size} selecionado(s)`}
                </button>
              </div>
            </div>
          )}
        </>
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

const ABAS = [
  { chave: 'fila',       titulo: 'Fila' },
  { chave: 'revisoes',   titulo: 'Próximas revisões' },
  { chave: 'automacoes', titulo: 'Automações' },
  { chave: 'resultados', titulo: 'Resultados' },
];

/**
 * Follow-up: lugar único de contato com o cliente. Abas na URL (?aba=)
 * para links de outras telas abrirem direto no lugar certo.
 */
export default function Followup() {
  const ehAdmin = getUser()?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some((a) => a.chave === params.get('aba')) ? params.get('aba') : 'fila';
  const [antecedencia, setAntecedencia] = useState(null);
  const [versaoFila, setVersaoFila] = useState(0);

  useEffect(() => {
    if (aba !== 'revisoes') return;
    api.followupAutomacoes()
      .then((d) => setAntecedencia(d.automacoes.find((a) => a.chave === 'revisao')?.antecedencia_dias ?? null))
      .catch(() => {});
  }, [aba]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
          Follow-up
        </h1>
        <nav className="mt-3 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 pb-px" aria-label="Seções do follow-up">
          {ABAS.map((a) => {
            const ativa = a.chave === aba;
            return (
              <button key={a.chave} type="button" aria-current={ativa ? 'page' : undefined}
                onClick={() => setParams(a.chave === 'fila' ? {} : { aba: a.chave })}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 pb-2 pt-1 text-sm font-semibold transition
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500
                  ${ativa ? 'border-maninho-600 text-maninho-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                {a.titulo}
              </button>
            );
          })}
        </nav>
      </div>

      {aba === 'fila' && <Fila key={versaoFila} />}
      {aba === 'revisoes' && <Revisoes antecedencia={antecedencia} />}
      {aba === 'automacoes' && <Automacoes ehAdmin={ehAdmin} onFilaMudou={() => setVersaoFila((v) => v + 1)} />}
      {aba === 'resultados' && <Resultados />}
    </div>
  );
}

const ORDENS = [
  ['urgencia', 'Por urgência'],
  ['recentes', 'Mais recentes primeiro'],
  ['antigos', 'Mais antigos primeiro'],
];

function lerOrdem() {
  try {
    const o = localStorage.getItem('followup.ordem');
    return ORDENS.some(([k]) => k === o) ? o : 'urgencia';
  } catch { return 'urgencia'; }
}

function ordenar(lista, ordem) {
  if (ordem === 'urgencia') return lista;
  const sinal = ordem === 'recentes' ? -1 : 1;
  return [...lista].sort((a, b) => sinal * (new Date(dataDoCard(a)) - new Date(dataDoCard(b))));
}

function Fila() {
  const usuario = getUser();
  const ehAdmin = usuario?.role === 'admin';
  const [dados, setDados] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState(lerOrdem);
  const [soProblemas, setSoProblemas] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [confirmacao, setConfirmacao] = useState(null);
  const [enviandoId, setEnviandoId] = useState('');
  const [gerando, setGerando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [loteAberto, setLoteAberto] = useState(false);
  const [historicoId, setHistoricoId] = useState(null);
  const [manualAberto, setManualAberto] = useState(false);
  // Seleção para excluir/dispensar vários
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState(() => new Set());
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
    api.metricasFollowup(30).then(setMetricas).catch(() => {});
  }, [tipoFiltro, busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  function mudarOrdem(o) {
    setOrdem(o);
    try { localStorage.setItem('followup.ordem', o); } catch { /* sem storage: vale só nesta visita */ }
  }

  // Lote em segundo plano: enquanto roda, mostra o progresso no botão e
  // atualiza o Kanban a cada 10s para os cards irem mudando de coluna.
  const [lote, setLote] = useState(null);
  const verLote = useCallback(() => {
    api.followupEnvioLote().then(setLote).catch(() => {});
  }, []);
  useEffect(() => { verLote(); }, [verLote]);
  useEffect(() => {
    if (!lote?.em_andamento) return undefined;
    const t = setInterval(() => {
      api.followupEnvioLote().then((e) => {
        setLote(e);
        carregar();
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [lote?.em_andamento, carregar]);

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
    if (selecionando) return;
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
    if (COLUNA_DO_STATUS[item.status] === colunaChave) return;

    const novoStatus = COLUNA_PARA_STATUS[colunaChave];
    // Fechado: pergunta se converteu ou dispensou.
    if (novoStatus === 'FECHADO_ESCOLHER') {
      setConfirmacao({
        titulo: `Fechar follow-up: ${item.cliente_nome}`,
        mensagem: 'Como este follow-up terminou?',
        acoes: (fechar) => (
          <>
            <button className="btn-ghost" onClick={fechar}>Cancelar</button>
            <button className="btn bg-slate-200 text-slate-700 hover:bg-slate-300"
              onClick={() => { fechar(); mudarStatusItem(item.id, 'dispensado'); }}>
              Dispensado
            </button>
            <button className="btn-primary"
              onClick={() => { fechar(); mudarStatusItem(item.id, 'converteu'); }}>
              Virou serviço
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
    } catch (e) { setErro(e.message); }
    finally { setEnviandoId(''); carregar(); }
  }

  async function emLote(ids, acaoLote) {
    setErro(''); setMsgOk('');
    try {
      const r = await api.followupEmLote(ids, acaoLote);
      const n = r.afetados;
      setMsgOk(`${n} card${n === 1 ? '' : 's'} ${acaoLote === 'excluir' ? (n === 1 ? 'excluído' : 'excluídos') : (n === 1 ? 'dispensado' : 'dispensados')}.`);
      setSel(new Set()); setSelecionando(false);
      carregar();
    } catch (e) { setErro(e.message); }
  }

  function confirmarLote(ids, acaoLote) {
    const n = ids.length;
    const excluir = acaoLote === 'excluir';
    setConfirmacao({
      titulo: excluir ? `Excluir ${n} card${n === 1 ? '' : 's'}` : `Dispensar ${n} card${n === 1 ? '' : 's'}`,
      mensagem: excluir
        ? 'Os cards somem da fila e do histórico do follow-up. Não dá para desfazer.'
        : 'Os cards vão para Fechados como dispensados. O histórico fica guardado.',
      rotulo: excluir ? 'Excluir' : 'Dispensar',
      tom: excluir ? 'perigo' : 'primary',
      onConfirmar: () => emLote(ids, acaoLote),
    });
  }

  function acao(item, tipo) {
    setErro('');
    if (tipo === 'enviar') {
      if (!item.cliente_telefone) { setErro('Cliente sem telefone'); return; }
      setConfirmacao({
        titulo: 'Enviar follow-up',
        mensagem: `Enviar a mensagem pelo WhatsApp para ${item.cliente_nome} (${telefone(item.cliente_telefone)})?`,
        rotulo: 'Enviar',
        tom: 'ouro',
        onConfirmar: () => enviarItem(item),
      });
      return;
    }
    if (tipo === 'wa') {
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
    if (tipo === 'excluir') {
      setConfirmacao({
        titulo: 'Excluir card',
        mensagem: `O card de ${item.cliente_nome} sai da fila e do histórico do follow-up. Não dá para desfazer.`,
        rotulo: 'Excluir', tom: 'perigo',
        onConfirmar: () => emLote([item.id], 'excluir'),
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
      setMsgOk(r.gerados ? `${r.gerados} cliente${r.gerados === 1 ? '' : 's'} entraram na fila.` : 'Ninguém novo para chamar agora.');
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setGerando(false); }
  }

  async function verificar() {
    setVerificando(true); setErro(''); setMsgOk('');
    try {
      const r = await api.verificarNumerosFollowup();
      if (r.sem_whatsapp) {
        setMsgOk(`${r.sem_whatsapp} cliente${r.sem_whatsapp === 1 ? ' não tem' : 's não têm'} WhatsApp. Eles estão em "Não dá para enviar".`);
        setSoProblemas(true);
      } else {
        setMsgOk(`Todos os ${r.com_whatsapp} números pendentes têm WhatsApp.`);
      }
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setVerificando(false); }
  }

  function marcar(id) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const c = dados?.contagens || { todos: 0, manutencao: 0, reativacao: 0, promocao: 0, avaliacao: 0 };

  // Para enviar, separado por urgência; e os números do funil.
  const aFazer = dados?.colunas?.['a-fazer'] || [];
  const comProblema = aFazer.filter((i) => !i.envio_iniciado_em && problemaDo(i));
  const pendentes = useMemo(() => {
    const g = { atrasados: [], hoje: [], proximos: [] };
    for (const item of dados?.colunas?.['a-fazer'] || []) g[urgencia(item).grupo].push(item);
    return g;
  }, [dados]);
  const prontosHoje = [...pendentes.atrasados, ...pendentes.hoje]
    .filter((i) => !i.envio_iniciado_em && !problemaDo(i)).length;
  const fechados = dados?.colunas?.fechado || [];
  const viraramServico = fechados.filter((i) => i.status === 'converteu').length;

  const detalheColuna = {
    'a-fazer': pendentes.atrasados.length
      ? { texto: `${pendentes.atrasados.length} atrasado${pendentes.atrasados.length > 1 ? 's' : ''}`, alerta: true }
      : { texto: pendentes.hoje.length ? `${pendentes.hoje.length} para hoje` : 'nada para hoje' },
    enviado: { texto: metricas?.enviados ? `${metricas.taxa_resposta}% respondem (30 dias)` : 'sem envios em 30 dias' },
    'em-conversa': { texto: 'responderam, falta fechar' },
    fechado: { texto: `${viraramServico} virou serviço` },
  };

  const cardProps = (item) => ({
    item, enviando: enviandoId, onAcao: acao, onHistorico: setHistoricoId, onDragStart, onDragEnd, ehAdmin,
    selecionando, marcado: sel.has(item.id), onMarcar: () => marcar(item.id),
  });

  const listaProblemas = ordenar(comProblema, ordem === 'urgencia' ? 'recentes' : ordem);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-sm text-slate-500">
          Resposta do cliente e volta à oficina movem o card sozinhos. Arraste quando precisar ajustar.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {ehAdmin && (
            <button type="button" onClick={verificar} disabled={verificando} className="btn-ghost"
              title="Pergunta ao WhatsApp quais clientes da fila têm conta. Quem não tem fica marcado.">
              {verificando ? <Spinner className="h-4 w-4" /> : <PhoneOff className="h-4 w-4" />}
              Verificar números
            </button>
          )}
          {ehAdmin && (
            <button type="button" onClick={gerar} disabled={gerando} className="btn-ghost"
              title="Procura agora quem se encaixa nas automações (também roda sozinho todo dia de manhã)">
              {gerando ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar fila
            </button>
          )}
          <button type="button" onClick={() => setManualAberto(true)} className="btn-ghost">
            <Plus className="h-4 w-4" /> Novo follow-up
          </button>
          {ehAdmin && (
            <button type="button" onClick={() => setLoteAberto(true)} className="btn-ouro">
              {lote?.em_andamento
                ? <><Spinner className="h-4 w-4" /> Enviando {lote.processados} de {lote.total}</>
                : <><Send className="h-4 w-4" /> {prontosHoje ? `Enviar ${prontosHoje} de hoje` : 'Enviar pendentes'}</>}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
          {[['todos', 'Todos'], ...Object.entries(TIPO_META)
            .filter(([k]) => k !== 'livre')
            .map(([k, m]) => [k, m.label])].map(([k, label]) => {
            const ativo = tipoFiltro === k && !soProblemas;
            const Icone = TIPO_META[k]?.Icone;
            return (
              <button key={k} type="button" onClick={() => { setTipoFiltro(k); setSoProblemas(false); }} aria-pressed={ativo}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500
                  ${ativo
                    ? 'border-maninho-600 bg-maninho-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                {Icone && <Icone className="h-3.5 w-3.5" aria-hidden="true" />}
                {label}
                <span className={`tabular-nums ${ativo ? 'text-white/75' : 'text-slate-400'}`}>{c[k] || 0}</span>
              </button>
            );
          })}
          {comProblema.length > 0 && (
            <button type="button" onClick={() => setSoProblemas((v) => !v)} aria-pressed={soProblemas}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500
                ${soProblemas
                  ? 'border-rose-600 bg-rose-600 text-white'
                  : 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300'}`}>
              <PhoneOff className="h-3.5 w-3.5" aria-hidden="true" />
              Não dá para enviar
              <span className={`tabular-nums ${soProblemas ? 'text-white/80' : 'text-rose-500'}`}>{comProblema.length}</span>
            </button>
          )}
        </div>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Ordenar</span>
            <select className="input h-8 w-auto py-0 pl-2 pr-8 text-xs" value={ordem}
              onChange={(e) => mudarOrdem(e.target.value)}>
              {ORDENS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </label>
          <label className="relative order-first basis-full sm:order-none sm:basis-auto sm:w-56">
            <span className="sr-only">Buscar cliente ou placa</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-8 pl-9 text-sm" placeholder="Buscar cliente ou placa"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          {ehAdmin && (
            <button type="button" aria-pressed={selecionando}
              onClick={() => { setSelecionando((v) => !v); setSel(new Set()); }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500
                ${selecionando ? 'border-maninho-600 bg-maninho-50 text-maninho-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              {selecionando ? 'Cancelar seleção' : 'Selecionar'}
            </button>
          )}
        </div>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {msgOk && <Alerta tipo="ok" onFechar={() => setMsgOk('')}>{msgOk}</Alerta>}

      {!dados ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUNAS.map((col) => <Skeleton key={col.chave} className="h-72" />)}
        </div>
      ) : soProblemas ? (
        <section aria-label="Não dá para enviar" className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-slate-800">
                Não dá para enviar ({comProblema.length})
              </h2>
              <p className="text-sm text-slate-500">
                Sem telefone, sem WhatsApp ou o envio falhou. Corrija o telefone no cadastro do cliente ou exclua o card.
              </p>
            </div>
            {ehAdmin && comProblema.length > 0 && (
              <button type="button" className="btn bg-rose-600 text-white shadow-sm hover:bg-rose-700"
                onClick={() => confirmarLote(comProblema.map((i) => i.id), 'excluir')}>
                <Trash2 className="h-4 w-4" /> Excluir todos ({comProblema.length})
              </button>
            )}
          </div>
          {comProblema.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nenhum card com problema.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {listaProblemas.map((item) => <CardFollowup key={item.id} {...cardProps(item)} />)}
            </div>
          )}
        </section>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUNAS.map((col) => {
            const cards = ordenar(dados.colunas[col.chave] || [], ordem);
            const alvo = colunaAlvo === col.chave;
            const det = detalheColuna[col.chave];
            return (
              <section key={col.chave} aria-label={col.titulo}
                onDragOver={(e) => onDragOverColuna(e, col.chave)}
                onDragLeave={() => colunaAlvo === col.chave && setColunaAlvo(null)}
                onDrop={(e) => onDropColuna(e, col.chave)}
                className={`flex flex-col rounded-xl border bg-slate-50 transition
                  ${alvo ? 'border-maninho-500 bg-maninho-50 ring-2 ring-maninho-500' : 'border-slate-200'}`}>
                {/* Funil: o número da etapa é o título da coluna */}
                <header className="flex items-end gap-2 border-b border-slate-200 px-3 pb-2.5 pt-3">
                  <span className="font-display text-[34px] font-semibold leading-none tabular-nums text-slate-800">
                    {cards.length}
                  </span>
                  <div className="min-w-0 pb-0.5">
                    <h2 className="text-sm font-semibold leading-tight text-slate-700">{col.titulo}</h2>
                    <p className={`text-xs leading-tight ${det.alerta ? 'font-semibold text-ouro-600' : 'text-slate-500'}`}>
                      {det.texto}
                    </p>
                  </div>
                </header>
                {selecionando && cards.length > 0 && (
                  <div className="border-b border-slate-200 px-3 py-1.5 text-right">
                    <button type="button" className="text-xs font-semibold text-maninho-700 hover:underline"
                      onClick={() => setSel((s) => {
                        const n = new Set(s);
                        const todos = cards.every((i) => n.has(i.id));
                        for (const i of cards) { if (todos) n.delete(i.id); else n.add(i.id); }
                        return n;
                      })}>
                      {cards.every((i) => sel.has(i.id)) ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  </div>
                )}

                <div className="max-h-[calc(100vh-17rem)] min-h-[12rem] overflow-y-auto p-2">
                  {cards.length === 0 ? (
                    <p className={`rounded-lg border border-dashed px-3 py-8 text-center text-xs
                      ${alvo ? 'border-maninho-500 text-maninho-700' : 'border-slate-300 text-slate-400'}`}>
                      {alvo ? 'Solte aqui' : {
                        'a-fazer': 'Ninguém para chamar agora.',
                        enviado: 'Nenhuma mensagem aguardando resposta.',
                        'em-conversa': 'Quem responder aparece aqui.',
                        fechado: 'Conversas encerradas aparecem aqui.',
                      }[col.chave]}
                    </p>
                  ) : col.chave === 'a-fazer' && ordem === 'urgencia' ? (
                    <div className="space-y-3">
                      {GRUPOS_PENDENTES.filter((g) => pendentes[g.chave].length).map((g) => (
                        <div key={g.chave}>
                          <h3 className={`mb-1.5 px-1 text-xs font-semibold
                            ${g.chave === 'atrasados' ? 'text-ouro-600' : 'text-slate-500'}`}>
                            {g.titulo} ({pendentes[g.chave].length})
                          </h3>
                          <div className="space-y-2">
                            {pendentes[g.chave].map((item) => (
                              <CardFollowup key={item.id} {...cardProps(item)} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : col.chave === 'fechado' ? (
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white px-2">
                      {cards.map((item) => <LinhaFechada key={item.id} {...cardProps(item)} />)}
                    </ul>
                  ) : (
                    <div className="space-y-2">
                      {cards.map((item) => <CardFollowup key={item.id} {...cardProps(item)} />)}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selecionando && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-xl">
            <span className="text-sm font-semibold text-slate-700">
              {sel.size ? `${sel.size} selecionado${sel.size === 1 ? '' : 's'}` : 'Toque nos cards para selecionar'}
            </span>
            <button type="button" className="btn-ghost h-9" disabled={!sel.size}
              onClick={() => confirmarLote([...sel], 'dispensar')}>
              <X className="h-4 w-4" /> Dispensar
            </button>
            <button type="button" className="btn h-9 bg-rose-600 text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              disabled={!sel.size} onClick={() => confirmarLote([...sel], 'excluir')}>
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
            <button type="button" className="h-9 px-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
              onClick={() => { setSelecionando(false); setSel(new Set()); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {historicoId && (
        <ModalHistorico clienteId={historicoId} onFechar={() => setHistoricoId(null)} />
      )}

      <FormManual aberto={manualAberto} onFechar={() => setManualAberto(false)}
        onCriado={() => { setManualAberto(false); carregar(); }} />

      <ModalEnvioLote aberto={loteAberto}
        onFechar={() => { setLoteAberto(false); carregar(); verLote(); }} />

      <Confirmar dados={confirmacao} onFechar={() => setConfirmacao(null)} />
    </div>
  );
}
