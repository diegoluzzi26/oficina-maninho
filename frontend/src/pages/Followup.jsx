import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, getUser } from '../lib/api';
import { data, telefone } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

const TIPO_BADGE = {
  manutencao: { cor: 'bg-maninho-100 text-maninho-800', label: '🔧 Manutenção' },
  reativacao: { cor: 'bg-ouro-100 text-ouro-800',       label: '💤 Reativação' },
  promocao:   { cor: 'bg-emerald-100 text-emerald-800', label: '📢 Promoção' },
  avaliacao:  { cor: 'bg-amber-100 text-amber-800',     label: '⭐ Avaliação' },
};
const STATUS_BADGE = {
  pendente:   { cor: 'bg-slate-100 text-slate-700',      label: 'Pendente' },
  enviado:    { cor: 'bg-sky-100 text-sky-800',          label: 'Enviado' },
  respondeu:  { cor: 'bg-indigo-100 text-indigo-800',    label: 'Respondeu' },
  converteu:  { cor: 'bg-ouro-100 text-ouro-800',        label: '✓ Converteu' },
  dispensado: { cor: 'bg-slate-100 text-slate-500',      label: 'Dispensado' },
};

function linkWhatsApp(tel, mensagem) {
  const numero = String(tel || '').replace(/\D/g, '');
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Um card, uma ação principal.
 *
 * pendente               → botão grande "📱 Enviar WhatsApp"
 * enviado / respondeu    → botão grande "✓ Converteu"
 * converteu / dispensado → só as ações secundárias
 *
 * As ações secundárias (reagendar, copiar, dispensar, remover, enviar
 * pelo Evolution) ficam num rodapé discreto em texto pequeno. O card
 * deixou de parecer uma barra de ferramentas.
 */
function CardFollowup({ item, onMudou, ehAdmin }) {
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(''); // '' | 'enviar' | 'auto' | 'converteu' | ...
  const [reagendar, setReagendar] = useState(false);
  const [novaData, setNovaData] = useState(item.agendado_para?.slice(0, 10) || '');

  const semTelefone = !item.cliente_telefone;
  const encerrado = item.status === 'converteu' || item.status === 'dispensado';
  const jaEnviado = item.status === 'enviado' || item.status === 'respondeu';

  async function marcar(status) {
    setErro(''); setCarregando(status);
    try {
      const r = await api.followupMudarStatus(item.id, { status });
      onMudou(r);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(''); }
  }

  async function abrirWhatsApp() {
    if (semTelefone) { setErro('Cliente sem telefone cadastrado'); return; }
    window.open(linkWhatsApp(item.cliente_telefone, item.mensagem), '_blank');
    // Se ainda não foi marcado como enviado, pergunta.
    if (!jaEnviado) {
      setTimeout(() => {
        if (confirm('Mensagem enviada? Marcar como "Enviado"?')) marcar('enviado');
      }, 500);
    }
  }

  async function enviarAutomatico() {
    if (semTelefone) { setErro('Cliente sem telefone cadastrado'); return; }
    if (!confirm(`Enviar pelo Evolution direto pro ${item.cliente_telefone}?`)) return;
    setErro(''); setCarregando('auto');
    try {
      const r = await api.enviarFollowup(item.id);
      onMudou(r);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(''); }
  }

  async function excluir() {
    if (!confirm('Remover este follow-up da fila?')) return;
    try { await api.removerFollowup(item.id); onMudou(null, item.id); }
    catch (e) { setErro(e.message); }
  }

  async function salvarReagendar() {
    if (!novaData) return;
    try {
      const r = await api.followupReagendar(item.id, { agendado_para: novaData });
      setReagendar(false);
      onMudou(r);
    } catch (e) { setErro(e.message); }
  }

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(item.mensagem);
      // Feedback visual leve — reaproveita o slot de erro em azul.
      setErro('');
    } catch { /* ignore */ }
  }

  const tipo = TIPO_BADGE[item.tipo] || TIPO_BADGE.manutencao;
  const st = STATUS_BADGE[item.status] || STATUS_BADGE.pendente;

  // Botão principal muda conforme status. Fica null quando o item já
  // está encerrado (converteu/dispensado) — o card vira só histórico.
  let botaoPrincipal = null;
  if (item.status === 'pendente') {
    botaoPrincipal = (
      <button onClick={abrirWhatsApp} disabled={semTelefone}
        className="btn-ouro w-full sm:w-auto">
        📱 Enviar pelo WhatsApp
      </button>
    );
  } else if (jaEnviado) {
    botaoPrincipal = (
      <button onClick={() => marcar('converteu')} disabled={carregando === 'converteu'}
        className="btn-primary w-full sm:w-auto">
        {carregando === 'converteu' ? <><Spinner className="h-4 w-4" /> Salvando…</> : '✓ Cliente converteu'}
      </button>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tipo.cor}`}>
          {tipo.label}
        </span>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cor}`}>
          {st.label}
        </span>
        {item.regra_nome && (
          <span className="hidden text-[11px] text-slate-500 sm:inline">· {item.regra_nome}</span>
        )}
        <span className="ml-auto text-[11px] text-slate-500">
          Agendado {data(item.agendado_para)}
        </span>
      </div>

      <p className="text-sm font-semibold text-slate-800">{item.cliente_nome}</p>
      <p className="text-xs text-slate-500">
        {telefone(item.cliente_telefone)}
        {item.placa && ` · ${item.marca} ${item.modelo} · ${item.placa}`}
      </p>

      <div className="my-3 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="whitespace-pre-wrap text-sm text-slate-700">{item.mensagem}</p>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {reagendar ? (
        <div className="flex items-center gap-2">
          <input type="date" className="input flex-1" value={novaData}
            onChange={(e) => setNovaData(e.target.value)} />
          <button onClick={salvarReagendar} className="btn-primary text-xs">Salvar</button>
          <button onClick={() => setReagendar(false)} className="btn-ghost text-xs">Cancelar</button>
        </div>
      ) : (
        <>
          {botaoPrincipal && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {botaoPrincipal}
              {item.status === 'pendente' && !semTelefone && (
                <button onClick={enviarAutomatico} disabled={carregando === 'auto'}
                  className="text-xs font-semibold text-slate-600 underline-offset-2 hover:text-maninho-700 hover:underline">
                  {carregando === 'auto' ? '⌛ Enviando…' : 'ou enviar sem abrir o WhatsApp'}
                </button>
              )}
            </div>
          )}

          {/* Rodapé com ações secundárias sempre presentes */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <button onClick={copiarMensagem} className="hover:text-maninho-700">📋 Copiar</button>
            <button onClick={() => setReagendar(true)} className="hover:text-maninho-700">📅 Reagendar</button>
            {item.status === 'pendente' && (
              <button onClick={() => marcar('enviado')} className="hover:text-emerald-700">
                marcar como enviado
              </button>
            )}
            {!encerrado && (
              <button onClick={() => marcar('dispensado')} className="hover:text-rose-600">
                ✕ Dispensar
              </button>
            )}
            {ehAdmin && (
              <button onClick={excluir}
                className="ml-auto text-rose-500 hover:text-rose-700">
                remover
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FormManual({ aberto, onFechar, onCriado }) {
  const vazio = { cliente_id: '', tipo: 'promocao', mensagem: '', agendado_para: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState(vazio);
  const [clientes, setClientes] = useState([]);
  const [buscaCli, setBuscaCli] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (aberto) { setForm(vazio); setErro(''); setBuscaCli(''); } }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => {
      api.clientes({ busca: buscaCli, por_pagina: 20 }).then((r) => setClientes(r.dados)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [aberto, buscaCli]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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

        <Campo label="Mensagem" obrigatorio>
          <textarea className="input min-h-[140px] resize-y" value={form.mensagem}
            onChange={set('mensagem')} required minLength={10} maxLength={2000}
            placeholder="Digite a mensagem que o cliente vai receber…" />
        </Campo>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando || !form.cliente_id}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Followup() {
  const usuario = getUser();
  const ehAdmin = usuario?.role === 'admin';
  const [lista, setLista] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('pendente');
  const [filtroTipo, setFiltroTipo]     = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(false);
  const [enviandoTodos, setEnviandoTodos] = useState(false);
  const [manualAberto, setManualAberto] = useState(false);

  const carregar = useCallback(() => {
    setErro('');
    const params = { por_pagina: 100 };
    if (filtroStatus) params.status = filtroStatus;
    if (filtroTipo)   params.tipo   = filtroTipo;
    if (busca)        params.busca  = busca;
    Promise.all([api.followupFila(params), api.metricasFollowup(30)])
      .then(([l, m]) => { setLista(l); setMetricas(m); })
      .catch((e) => setErro(e.message));
  }, [filtroStatus, filtroTipo, busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  async function gerar() {
    setGerando(true); setErro('');
    try {
      const r = await api.gerarFollowup();
      alert(`${r.gerados} follow-up(s) gerado(s)`);
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setGerando(false); }
  }

  async function enviarTodosPendentes() {
    if (!confirm('Enviar TODOS os follow-ups pendentes (agendados até hoje) via Evolution API?')) return;
    setEnviandoTodos(true); setErro('');
    try {
      const r = await api.enviarFollowupsPendentes();
      const msg = `Enviados: ${r.enviados}/${r.total}` +
        (r.falhas.length ? `\nFalhas: ${r.falhas.length}` : '');
      alert(msg);
      carregar();
    } catch (e) { setErro(e.message); }
    finally { setEnviandoTodos(false); }
  }

  function itemMudou(atualizado, removidoId) {
    if (removidoId) {
      setLista((l) => l ? { ...l, dados: l.dados.filter((x) => x.id !== removidoId) } : l);
    } else if (atualizado) {
      setLista((l) => l ? { ...l, dados: l.dados.map((x) => x.id === atualizado.id ? atualizado : x) } : l);
    }
    api.metricasFollowup(30).then(setMetricas).catch(() => {});
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Follow-up</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Contato ativo com o cliente via WhatsApp
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={() => setManualAberto(true)}>+ Novo</button>
          {ehAdmin && (
            <>
              <button className="btn-ghost" onClick={gerar} disabled={gerando}>
                {gerando ? <><Spinner className="h-4 w-4" /> Gerando…</> : '⚡ Gerar da fila'}
              </button>
              <button className="btn-ouro" onClick={enviarTodosPendentes} disabled={enviandoTodos}>
                {enviandoTodos ? <><Spinner className="h-4 w-4" /> Enviando…</> : '🚀 Enviar hoje'}
              </button>
              <Link to="/followup/regras"
                className="text-xs font-semibold text-slate-500 hover:text-maninho-700"
                title="Editar as regras que geram os follow-ups">
                ⚙ Regras
              </Link>
            </>
          )}
        </div>
      </div>

      {metricas && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Hoje', metricas.pendentes_hoje],
            ['Enviados (30d)', metricas.enviados],
            ['Resposta', `${metricas.taxa_resposta}%`],
            ['Conversão', `${metricas.taxa_conversao}%`],
          ].map(([l, v]) => (
            <div key={l} className="card p-3 text-center">
              <p className="tnum font-display text-2xl font-bold text-maninho-700">{v}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{l}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[160px] py-1.5 text-xs"
          value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="pendente">Pendentes</option>
          <option value="enviado">Enviados</option>
          <option value="respondeu">Responderam</option>
          <option value="converteu">Converteram</option>
          <option value="dispensado">Dispensados</option>
        </select>
        <select className="input max-w-[160px] py-1.5 text-xs"
          value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="manutencao">Manutenção</option>
          <option value="reativacao">Reativação</option>
          <option value="promocao">Promoção</option>
          <option value="avaliacao">Avaliação</option>
        </select>
        <input className="input max-w-xs" placeholder="Buscar cliente ou placa"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!lista ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : lista.dados.length === 0 ? (
        <Vazio titulo="Nenhum follow-up nessa lista"
          descricao={ehAdmin
            ? 'Clique em ⚡ Gerar fila pra criar follow-ups a partir das regras, ou + Manual pra montar um do zero.'
            : 'Peça pro admin gerar a fila, ou crie um manual clicando em + Manual.'} />
      ) : (
        <div className="space-y-3">
          {lista.dados.map((item) => (
            <CardFollowup key={item.id} item={item} onMudou={itemMudou} ehAdmin={ehAdmin} />
          ))}
        </div>
      )}

      <FormManual aberto={manualAberto} onFechar={() => setManualAberto(false)}
        onCriado={() => { setManualAberto(false); carregar(); }} />
    </div>
  );
}
