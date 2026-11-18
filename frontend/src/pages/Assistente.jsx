import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { brl } from '../lib/format';
import { Alerta, Campo, Spinner } from '../components/ui';

// Markdown simples das respostas (## título, **negrito**, listas "- ").
// Não usa dangerouslySetInnerHTML — quebra em elementos React.
function negrito(linha) {
  return linha.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (
    p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p
  ));
}

function renderMarkdown(texto) {
  return texto.split('\n').map((l, i) => {
    if (/^#{2,3}\s/.test(l)) {
      return <h3 key={i} className="mt-3 mb-1 font-display text-[14px] font-bold uppercase tracking-wide text-maninho-700">
        {l.replace(/^#{2,3}\s+/, '')}
      </h3>;
    }
    if (l.trim() === '') return null;
    if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      return <p key={i} className="mb-1 pl-4 text-sm text-slate-700 -indent-3">
        • {negrito(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}
      </p>;
    }
    return <p key={i} className="mb-1 text-sm text-slate-700">{negrito(l)}</p>;
  });
}

const PERGUNTAS_PRONTAS = [
  'Como estão as finanças da oficina este mês?',
  'Quais OS estão abertas há mais tempo?',
  'Quais despesas vencem nos próximos 7 dias?',
  'Como está o follow-up nos últimos 30 dias?',
  'Quais serviços mais faturaram nos últimos 3 meses?',
  'Como aumentar o ticket médio sem perder cliente?',
];

// Nomes amigáveis das consultas que o consultor fez (rodapé da resposta).
const NOMES_CONSULTA = {
  buscar_clientes: 'clientes', detalhes_cliente: 'ficha do cliente', historico_veiculo: 'histórico do veículo',
  listar_ordens: 'ordens de serviço', detalhes_ordem: 'detalhe da OS', painel_financeiro: 'painel financeiro',
  faturamento_periodo: 'faturamento', listar_despesas: 'despesas', fila_followup: 'fila de follow-up',
  metricas_followup: 'métricas de follow-up', propor_mensagem_whatsapp: 'rascunho de WhatsApp',
  propor_followup: 'proposta de follow-up',
};

const TIPOS_FOLLOWUP = {
  manutencao: 'Manutenção', reativacao: 'Reativação', promocao: 'Promoção', avaliacao: 'Avaliação',
};

// ------------------ Cartões de ação (só gravam com confirmação) ------------------
function CartaoWhatsApp({ proposta }) {
  const [mensagem, setMensagem] = useState(proposta.mensagem);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try { await navigator.clipboard.writeText(mensagem); setCopiado(true); } catch { /* sem permissão */ }
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Rascunho de WhatsApp</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">
        {proposta.cliente_nome}{proposta.telefone ? <span className="font-normal text-slate-500"> · {proposta.telefone}</span> : null}
      </p>
      <textarea rows={4} className="input mt-2 text-sm" value={mensagem} maxLength={2000}
        onChange={(e) => { setMensagem(e.target.value); setCopiado(false); }} />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar'}</button>
        {proposta.numero_whatsapp ? (
          <a className="btn-primary text-xs" target="_blank" rel="noreferrer"
            href={`https://wa.me/${proposta.numero_whatsapp}?text=${encodeURIComponent(mensagem)}`}>
            Abrir no WhatsApp
          </a>
        ) : (
          <span className="self-center text-xs text-slate-500">Cliente sem telefone cadastrado.</span>
        )}
      </div>
    </div>
  );
}

function CartaoFollowup({ proposta }) {
  const [mensagem, setMensagem] = useState(proposta.mensagem);
  const [agendado, setAgendado] = useState(proposta.agendado_para || '');
  const [estado, setEstado] = useState('pendente'); // pendente | salvando | salvo | descartado
  const [erro, setErro] = useState('');

  async function confirmar() {
    setErro(''); setEstado('salvando');
    try {
      await api.criarFollowupManual({
        cliente_id: proposta.cliente_id,
        carro_id: proposta.carro_id || null,
        tipo: proposta.tipo_followup,
        mensagem,
        ...(agendado ? { agendado_para: agendado } : {}),
        ...(proposta.notas ? { notas: proposta.notas } : {}),
      });
      setEstado('salvo');
    } catch (e) { setErro(e.message); setEstado('pendente'); }
  }

  if (estado === 'descartado') {
    return <p className="text-xs text-slate-400">Proposta de follow-up para {proposta.cliente_nome} descartada.</p>;
  }

  return (
    <div className="rounded-lg border border-maninho-200 bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-maninho-700">
        Proposta de follow-up · {TIPOS_FOLLOWUP[proposta.tipo_followup] || proposta.tipo_followup}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">
        {proposta.cliente_nome}{proposta.carro_rotulo ? <span className="font-normal text-slate-500"> · {proposta.carro_rotulo}</span> : null}
      </p>
      {estado === 'salvo' ? (
        <p className="mt-2 text-sm text-emerald-700">
          ✓ Adicionado à fila de follow-up{agendado ? ` para ${agendado.split('-').reverse().join('/')}` : ''}.
        </p>
      ) : (
        <>
          <textarea rows={4} className="input mt-2 text-sm" value={mensagem} maxLength={2000}
            onChange={(e) => setMensagem(e.target.value)} />
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <label className="mr-auto flex items-center gap-2 text-xs text-slate-600">
              Agendar para
              <input type="date" className="input h-8 w-auto py-0 text-xs" value={agendado}
                onChange={(e) => setAgendado(e.target.value)} />
            </label>
            <button type="button" className="btn-ghost text-xs" disabled={estado === 'salvando'}
              onClick={() => setEstado('descartado')}>Descartar</button>
            <button type="button" className="btn-primary text-xs"
              disabled={estado === 'salvando' || mensagem.trim().length < 10}
              onClick={confirmar}>
              {estado === 'salvando' ? 'Salvando…' : 'Adicionar à fila'}
            </button>
          </div>
          {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
        </>
      )}
    </div>
  );
}

// ------------------ Consultor (chat) ------------------
function Consultor() {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const fimRef = useRef(null);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens, carregando]);

  async function perguntar(pergunta) {
    const p = (pergunta ?? texto).trim();
    if (!p || carregando) return;
    // Manda só as últimas 20 mensagens pra limitar custo por pergunta.
    const historico = [...mensagens, { role: 'user', content: p }];
    setMensagens(historico); setTexto(''); setErro(''); setCarregando(true);
    try {
      // Só role/content vão pra API; propostas e consultas ficam na tela.
      const r = await api.iaConversar(historico.slice(-20).map(({ role, content }) => ({ role, content })));
      setMensagens((m) => [...m, {
        role: 'assistant', content: r.resposta,
        propostas: r.propostas || [], consultas: r.consultas || [],
      }]);
    } catch (e) {
      setErro(e.message);
      // Devolve a pergunta pro campo pra dar pra tentar de novo.
      setMensagens((m) => m.slice(0, -1)); setTexto(p);
    } finally { setCarregando(false); }
  }

  return (
    <div className="card flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {mensagens.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-slate-700">Pergunte qualquer coisa sobre a gestão da oficina.</p>
            <p className="mt-1 text-xs text-slate-500">
              O consultor consulta clientes, veículos, OS, financeiro, despesas e follow-up da oficina.
              Mensagens e follow-ups que ele sugerir só valem depois que você confirmar.
            </p>
            <div className="mx-auto mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
              {PERGUNTAS_PRONTAS.map((q) => (
                <button key={q} onClick={() => perguntar(q)}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-maninho-400 hover:bg-maninho-50">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${m.role === 'user'
              ? 'bg-maninho-600 text-sm text-white'
              : 'border border-slate-200 bg-slate-50/70'}`}>
              {m.role === 'user' ? m.content : renderMarkdown(m.content)}
              {m.propostas?.length > 0 && (
                <div className="mt-2 space-y-2">
                  {m.propostas.map((p, j) => (p.tipo === 'whatsapp'
                    ? <CartaoWhatsApp key={j} proposta={p} />
                    : <CartaoFollowup key={j} proposta={p} />))}
                </div>
              )}
              {m.consultas?.length > 0 && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Consultou: {[...new Set(m.consultas.map((c) => NOMES_CONSULTA[c] || c))].join(', ')}
                </p>
              )}
            </div>
          </div>
        ))}
        {carregando && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Spinner className="h-4 w-4" /> Consultando os dados da oficina…
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {erro && <div className="px-4"><Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta></div>}

      <form className="flex gap-2 border-t border-slate-200 p-3"
        onSubmit={(e) => { e.preventDefault(); perguntar(); }}>
        <textarea rows={1} className="input min-h-[40px] flex-1 resize-none"
          placeholder="Ex: quando o João da Silva veio pela última vez?"
          value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(); } }} />
        <button type="submit" className="btn-primary" disabled={carregando || !texto.trim()}>Enviar</button>
        {mensagens.length > 0 && (
          <button type="button" className="btn-ghost text-xs" disabled={carregando}
            onClick={() => { setMensagens([]); setErro(''); }}>
            Nova conversa
          </button>
        )}
      </form>
    </div>
  );
}

// ------------------ Precificação ------------------
function FaixaPreco({ rotulo, valor, destaque, ajuda }) {
  return (
    <div className={`min-w-0 rounded-lg border px-2 py-3 text-center ${destaque
      ? 'border-maninho-400 bg-maninho-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</p>
      <p className={`tnum mt-1 whitespace-nowrap font-display font-bold ${destaque
        ? 'text-xl text-maninho-700 xl:text-2xl' : 'text-lg text-slate-800 xl:text-xl'}`}>
        {brl(valor)}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">{ajuda}</p>
    </div>
  );
}

function Precificar({ servicoInicial }) {
  const [servicos, setServicos] = useState([]);
  const [form, setForm] = useState({
    servico_id: servicoInicial || '', descricao: '', tempo_min: '',
    veiculo: '', observacao: '', horas_produtivas_mes: '',
  });
  const [resultado, setResultado] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvo, setSalvo] = useState('');

  useEffect(() => { api.servicos().then(setServicos).catch(() => {}); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function calcular(e) {
    e?.preventDefault();
    setErro(''); setSalvo(''); setResultado(null); setCarregando(true);
    try {
      const body = {};
      if (form.servico_id) body.servico_id = form.servico_id;
      else body.descricao = form.descricao;
      for (const k of ['tempo_min', 'horas_produtivas_mes']) if (form[k]) body[k] = Number(form[k]);
      for (const k of ['veiculo', 'observacao']) if (form[k].trim()) body[k] = form[k].trim();
      setResultado(await api.iaPrecificar(body));
    } catch (e2) { setErro(e2.message); }
    finally { setCarregando(false); }
  }

  async function aplicar(valor) {
    if (!resultado?.servico?.id) return;
    if (!confirm(`Atualizar o preço de "${resultado.servico.nome}" no catálogo para ${brl(valor)}?`)) return;
    setErro('');
    try {
      await api.atualizarServico(resultado.servico.id, { valor_padrao: valor });
      setSalvo(`Preço do catálogo atualizado para ${brl(valor)}.`);
      setResultado((r) => ({ ...r, servico: { ...r.servico, valor_padrao: valor } }));
    } catch (e) { setErro(e.message); }
  }

  const r = resultado;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
      <form className="card space-y-3 p-4" onSubmit={calcular}>
        <Campo label="Serviço do catálogo">
          <select className="input" value={form.servico_id} onChange={set('servico_id')}>
            <option value="">— Serviço novo / avulso —</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
        {!form.servico_id && (
          <Campo label="Descreva o serviço" obrigatorio>
            <input className="input" value={form.descricao} onChange={set('descricao')}
              placeholder="Ex: troca do alternador" maxLength={200} />
          </Campo>
        )}
        <Campo label="Tempo de execução (min)" ajuda="Vazio = usa o tempo do catálogo ou a IA estima.">
          <input type="number" min="1" className="input" value={form.tempo_min} onChange={set('tempo_min')} placeholder="90" />
        </Campo>
        <Campo label="Veículo (opcional)">
          <input className="input" value={form.veiculo} onChange={set('veiculo')} placeholder="Ex: Onix 1.0 2019" />
        </Campo>
        <Campo label="Observações (opcional)">
          <textarea rows={2} className="input" value={form.observacao} onChange={set('observacao')}
            placeholder="Ex: acesso difícil, precisa tirar o para-choque" maxLength={500} />
        </Campo>
        <Campo label="Horas vendidas por mês (opcional)"
          ajuda="Horas que a equipe realmente fatura no mês. Vazio = estima pelos funcionários ativos.">
          <input type="number" min="1" className="input" value={form.horas_produtivas_mes}
            onChange={set('horas_produtivas_mes')} placeholder="120" />
        </Campo>
        <button type="submit" className="btn-primary w-full"
          disabled={carregando || (!form.servico_id && !form.descricao.trim())}>
          {carregando ? 'Calculando…' : '💡 Sugerir preço'}
        </button>
      </form>

      <div className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        {salvo && <Alerta tipo="ok" onFechar={() => setSalvo('')}>{salvo}</Alerta>}

        {carregando ? (
          <div className="card flex flex-col items-center justify-center gap-3 py-16">
            <Spinner className="h-6 w-6" />
            <p className="text-sm text-slate-500">Cruzando custo da oficina, histórico e mercado…</p>
          </div>
        ) : !r ? (
          <div className="card p-6 text-sm text-slate-500">
            <p className="font-semibold text-slate-700">Como funciona</p>
            <p className="mt-2">
              O sistema calcula o <strong>custo da hora</strong> da oficina (média das despesas pagas nos últimos
              3 meses ÷ horas vendidas) e olha <strong>quanto você já cobrou</strong> por esse serviço no último ano.
              A IA usa isso, mais referência de mercado, pra sugerir 3 faixas de preço da mão de obra.
            </p>
            <p className="mt-2 text-xs text-slate-400">Peças ficam de fora: elas entram como itens separados na OS.</p>
          </div>
        ) : (
          <>
            <div className="card p-4">
              <p className="text-sm font-semibold text-slate-800">{r.servico.nome}</p>
              <p className="text-xs text-slate-500">
                {r.tempo_estimado_min ? `${r.tempo_estimado_min} min` : 'tempo não informado'}
                {r.tempo_estimado_pela_ia && r.tempo_estimado_min ? ' (estimado pela IA)' : ''}
                {r.servico.valor_padrao != null && <> · preço atual no catálogo: <strong>{brl(r.servico.valor_padrao)}</strong></>}
              </p>
              {/* Em lg a coluna do resultado fica estreita (form ao lado): empilha. */}
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <FaixaPreco rotulo="Mínimo" valor={r.preco_minimo} ajuda="abaixo disso dá prejuízo" />
                <FaixaPreco rotulo="Sugerido" valor={r.preco_sugerido} destaque ajuda="preço justo com margem" />
                <FaixaPreco rotulo="Premium" valor={r.preco_premium} ajuda="urgência, garantia, complexidade" />
              </div>
              {r.servico.id && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button className="btn-ghost text-xs" onClick={() => aplicar(r.preco_sugerido)}>
                    Usar sugerido no catálogo
                  </button>
                </div>
              )}
            </div>

            {r.justificativa && (
              <div className="card p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Por que esses valores</p>
                <p className="mt-1 text-sm text-slate-700">{r.justificativa}</p>
                {r.dicas.length > 0 && (
                  <>
                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dicas</p>
                    <ul className="mt-1 space-y-1">
                      {r.dicas.map((d, i) => <li key={i} className="text-sm text-slate-700">• {d}</li>)}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="card grid gap-3 p-4 text-xs text-slate-600 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Custo da oficina</p>
                <p className="mt-1">Despesa média/mês: <strong className="tnum">{brl(r.custo.despesa_media_mensal)}</strong></p>
                <p>Horas vendidas/mês: <strong className="tnum">{r.custo.horas_produtivas_mes}h</strong>
                  {r.custo.horas_estimadas && <span className="text-slate-400"> (estimado: {r.custo.funcionarios_ativos || 1} func. × 176h × 70%)</span>}
                </p>
                <p>Custo da hora: <strong className="tnum">{brl(r.custo.custo_hora)}</strong></p>
                {r.custo.custo_minimo_mao_de_obra != null && (
                  <p>Custo deste serviço: <strong className="tnum">{brl(r.custo.custo_minimo_mao_de_obra)}</strong></p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Já cobrado (12 meses)</p>
                {r.historico.vezes > 0 ? (
                  <>
                    <p className="mt-1">Vezes: <strong className="tnum">{r.historico.vezes}</strong></p>
                    <p>Menor: <strong className="tnum">{brl(r.historico.minimo)}</strong> · Maior: <strong className="tnum">{brl(r.historico.maximo)}</strong></p>
                    <p>Mediana: <strong className="tnum">{brl(r.historico.mediana)}</strong></p>
                  </>
                ) : (
                  <p className="mt-1 text-slate-400">Nenhuma OS paga com esse serviço no último ano.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------ Página ------------------
export default function Assistente() {
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') === 'preco' ? 'preco' : 'consultor';
  const [iaConfigurada, setIaConfigurada] = useState(true);

  useEffect(() => { api.iaStatus().then((s) => setIaConfigurada(s.configurada)).catch(() => {}); }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Assistente IA</h1>
        <p className="mt-0.5 text-sm text-slate-500">Pergunte sobre clientes, OS, financeiro e follow-up — e receba dicas de gestão e preço.</p>
      </div>

      <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm w-fit">
        {[['consultor', '🧠 Consultor de gestão'], ['preco', '💡 Precificar serviço']].map(([k, t]) => (
          <button key={k} onClick={() => setParams(k === 'preco' ? { aba: 'preco' } : {})}
            className={`rounded px-3.5 py-1.5 text-xs font-semibold transition
              ${aba === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t}
          </button>
        ))}
      </div>

      {!iaConfigurada && (
        <Alerta tipo="aviso">
          A IA não está configurada. Peça o admin pra adicionar <code>ANTHROPIC_API_KEY</code> no <code>.env</code> do servidor.
        </Alerta>
      )}

      {aba === 'consultor' ? <Consultor /> : <Precificar servicoInicial={params.get('servico') || ''} />}
    </div>
  );
}
