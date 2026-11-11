import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Star, RotateCcw, Megaphone, Check } from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton, Alerta, Modal, Spinner } from '../../components/ui';

/**
 * Automações do follow-up: quatro cartões fixos. Cada um diz em uma frase
 * quando a mensagem entra na fila, tem o prazo editável no meio da frase e
 * a mensagem com prévia ao lado. Nada sai sozinho: tudo cai na fila para
 * revisar e enviar.
 */

const EXEMPLO = {
  nome_cliente: 'Carlos', modelo_carro: 'Volkswagen Gol 1.6', placa: 'ABC1D23',
  servico: 'troca de óleo', dias_desde: '182',
};

const ROTULO_VARIAVEL = {
  nome_cliente: 'nome do cliente', modelo_carro: 'carro', placa: 'placa',
  servico: 'serviço', dias_desde: 'dias desde a visita', oficina: 'nome da oficina',
};

const CARTOES = {
  revisao: {
    Icone: Wrench, titulo: 'Revisão',
    resumo: 'Lembra o cliente quando um serviço ou peça com intervalo no catálogo está vencendo.',
    campo: 'antecedencia_dias', antes: 'Entra na fila', depois: 'dias antes do vencimento.',
    variaveis: ['nome_cliente', 'modelo_carro', 'placa', 'servico', 'oficina'],
  },
  pos_servico: {
    Icone: Star, titulo: 'Pós-serviço',
    resumo: 'Agradece e pergunta como foi, ou pede avaliação no Google.',
    campo: 'intervalo_dias', antes: 'Entra na fila', depois: 'dias depois de a OS ser paga ou finalizada.',
    variaveis: ['nome_cliente', 'modelo_carro', 'placa', 'oficina'],
  },
  reativacao: {
    Icone: RotateCcw, titulo: 'Reativação',
    resumo: 'Chama de volta quem sumiu. Cada cliente recebe no máximo uma vez por sumiço.',
    campo: 'intervalo_dias', antes: 'Entra na fila quando o cliente está há', depois: 'dias sem abrir OS.',
    variaveis: ['nome_cliente', 'dias_desde', 'oficina'],
  },
  campanha: {
    Icone: Megaphone, titulo: 'Campanha',
    resumo: 'Promoção ou aviso para a base. Só sai quando você monta.',
    campo: 'intervalo_dias', antes: 'Público: clientes atendidos nos últimos', depois: 'dias.',
    variaveis: ['nome_cliente', 'modelo_carro', 'oficina'],
  },
};

function renderizar(texto, ctx) {
  return String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (k in ctx ? ctx[k] : m));
}

function Interruptor({ ligado, onChange, rotulo, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo}
      onClick={() => onChange(!ligado)} disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500 disabled:opacity-50
        ${ligado ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${ligado ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

/** Balão no estilo de conversa, para a prévia da mensagem. */
function Previa({ texto }) {
  return (
    <div className="rounded-lg bg-slate-100 p-3">
      <p className="mb-1.5 text-[11px] font-medium text-slate-500">Como o cliente recebe</p>
      <div className="ml-auto max-w-[95%] whitespace-pre-wrap rounded-lg rounded-tr-sm bg-emerald-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800">
        {texto.trim() || <span className="text-slate-400">Mensagem vazia</span>}
      </div>
    </div>
  );
}

function ModalCampanha({ aberto, onFechar, mensagemPadrao, ctx, onCriada }) {
  const [mensagem, setMensagem] = useState('');
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setMensagem(mensagemPadrao || ''); setPrevia(null); setErro('');
    api.followupCampanha({}).then(setPrevia).catch((e) => setErro(e.message));
  }, [aberto, mensagemPadrao]);

  async function criar() {
    setCriando(true); setErro('');
    try {
      const r = await api.followupCampanha({ mensagem, confirmar: true });
      onCriada(r);
    } catch (e) { setErro(e.message); }
    finally { setCriando(false); }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Montar campanha" largura="max-w-2xl">
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      <p className="mb-3 text-sm text-slate-600">
        {previa === null
          ? 'Contando o público…'
          : previa.publico === 0
            ? 'Nenhum cliente no público agora (quem recebeu campanha nos últimos 30 dias fica de fora).'
            : `${previa.publico} cliente${previa.publico > 1 ? 's' : ''} vão para a fila. Você ainda revisa antes de enviar.`}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Mensagem desta campanha</span>
          <textarea className="input min-h-[180px] resize-y" value={mensagem}
            onChange={(e) => setMensagem(e.target.value)} />
        </label>
        <Previa texto={renderizar(mensagem, ctx)} />
      </div>
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
        <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-ouro"
          disabled={criando || !previa?.publico || mensagem.trim().length < 10} onClick={criar}>
          {criando ? <Spinner className="h-4 w-4" /> : null}
          Colocar {previa?.publico || ''} na fila
        </button>
      </div>
    </Modal>
  );
}

function Cartao({ a, info, ctx, ehAdmin, onSalvo, onCampanha }) {
  const meta = CARTOES[a.chave];
  const { Icone } = meta;
  const [form, setForm] = useState({ prazo: a[meta.campo], mensagem: a.mensagem_template });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [salvoAgora, setSalvoAgora] = useState(false);
  const area = useRef(null);

  useEffect(() => {
    setForm({ prazo: a[meta.campo], mensagem: a.mensagem_template });
  }, [a, meta.campo]);

  const mudou = Number(form.prazo) !== Number(a[meta.campo]) || form.mensagem !== a.mensagem_template;

  async function salvar(extra = {}) {
    setSalvando(true); setErro('');
    try {
      const atualizado = await api.atualizarFollowupAutomacao(a.chave, {
        [meta.campo]: Number(form.prazo), mensagem_template: form.mensagem, ...extra,
      });
      onSalvo(atualizado);
      setSalvoAgora(true);
      setTimeout(() => setSalvoAgora(false), 2000);
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  async function alternar(ligado) {
    setSalvando(true); setErro('');
    try {
      onSalvo(await api.atualizarFollowupAutomacao(a.chave, { ativo: ligado }));
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  function inserirVariavel(v) {
    const el = area.current;
    const token = `{${v}}`;
    if (!el) { setForm((f) => ({ ...f, mensagem: f.mensagem + token })); return; }
    const ini = el.selectionStart ?? form.mensagem.length;
    const fim = el.selectionEnd ?? ini;
    const nova = form.mensagem.slice(0, ini) + token + form.mensagem.slice(fim);
    setForm((f) => ({ ...f, mensagem: nova }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + token.length, ini + token.length); });
  }

  const ehCampanha = a.chave === 'campanha';
  const ativo = ehCampanha || a.ativo;

  return (
    <section className={`rounded-xl border bg-white p-4 sm:p-5 ${ativo ? 'border-slate-200' : 'border-dashed border-slate-300'}`}>
      <header className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ativo ? 'bg-maninho-50 text-maninho-700' : 'bg-slate-100 text-slate-400'}`}>
          <Icone className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-base font-semibold text-slate-800">{meta.titulo}</h2>
            <span className="text-xs text-slate-400">
              {a.gerados_30d ? `${a.gerados_30d} na fila nos últimos 30 dias` : 'nada nos últimos 30 dias'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{meta.resumo}</p>
        </div>
        {!ehCampanha && ehAdmin && (
          <Interruptor ligado={a.ativo} onChange={alternar} disabled={salvando}
            rotulo={`${a.ativo ? 'Desligar' : 'Ligar'} ${meta.titulo}`} />
        )}
      </header>

      {erro && <div className="mt-3"><Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta></div>}

      <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        {meta.antes}
        <input type="number" min={meta.campo === 'antecedencia_dias' ? 0 : 1} max={3650}
          className="input h-8 w-20 px-2 text-center tabular-nums" value={form.prazo}
          disabled={!ehAdmin} aria-label={`${meta.antes} (dias)`}
          onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))} />
        {meta.depois}
      </p>
      {a.chave === 'revisao' && info && (
        <p className="mt-1 text-xs text-slate-500">
          {info.servicos + info.pecas === 0
            ? 'Nenhum serviço ou peça tem intervalo de retorno no catálogo ainda. '
            : `${info.servicos} serviço${info.servicos === 1 ? '' : 's'} e ${info.pecas} peça${info.pecas === 1 ? '' : 's'} com intervalo de retorno. `}
          <Link to="/servicos" className="font-semibold text-maninho-700 hover:underline">Ajustar no catálogo</Link>
        </p>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div>
          <label htmlFor={`msg-${a.chave}`} className="mb-1 block text-xs font-semibold text-slate-600">
            Mensagem{ehCampanha ? ' padrão' : ''}
          </label>
          <textarea id={`msg-${a.chave}`} ref={area} className="input min-h-[150px] resize-y text-[13px] leading-relaxed"
            value={form.mensagem} disabled={!ehAdmin}
            onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))} />
          {ehAdmin && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {meta.variaveis.map((v) => (
                <button key={v} type="button" onClick={() => inserirVariavel(v)}
                  className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-maninho-500 hover:text-maninho-700">
                  + {ROTULO_VARIAVEL[v]}
                </button>
              ))}
            </div>
          )}
        </div>
        <Previa texto={renderizar(form.mensagem, ctx)} />
      </div>

      {ehAdmin && (
        <footer className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {salvoAgora && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <Check className="h-3.5 w-3.5" /> Salvo
            </span>
          )}
          {mudou && (
            <button type="button" className="btn-ghost"
              onClick={() => setForm({ prazo: a[meta.campo], mensagem: a.mensagem_template })}>
              Desfazer
            </button>
          )}
          <button type="button" className={ehCampanha ? 'btn-ghost' : 'btn-primary'}
            disabled={!mudou || salvando} onClick={() => salvar()}>
            {salvando ? <Spinner className="h-4 w-4" /> : null} Salvar
          </button>
          {ehCampanha && (
            <button type="button" className="btn-ouro" onClick={() => onCampanha(form.mensagem)}>
              <Megaphone className="h-4 w-4" /> Montar campanha
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

export default function Automacoes({ ehAdmin, onFilaMudou }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [campanha, setCampanha] = useState(null); // mensagem inicial do modal

  useEffect(() => {
    api.followupAutomacoes().then(setDados).catch((e) => setErro(e.message));
  }, []);

  function aoSalvar(atualizado) {
    setDados((d) => ({ ...d, automacoes: d.automacoes.map((a) => (a.chave === atualizado.chave ? atualizado : a)) }));
  }

  const ctx = { ...EXEMPLO, oficina: dados?.oficina || 'sua oficina' };

  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-sm text-slate-500">
        O sistema monta a fila todo dia de manhã com o que está ligado aqui. Nada é enviado sozinho:
        tudo aparece em Para enviar para você conferir e mandar.
      </p>
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {msgOk && <Alerta tipo="ok" onFechar={() => setMsgOk('')}>{msgOk}</Alerta>}
      {!dados ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : (
        dados.automacoes.map((a) => (
          <Cartao key={a.chave} a={a} info={dados.catalogo_com_intervalo} ctx={ctx} ehAdmin={ehAdmin}
            onSalvo={aoSalvar} onCampanha={(m) => setCampanha(m)} />
        ))
      )}

      <ModalCampanha aberto={campanha !== null} mensagemPadrao={campanha} ctx={ctx}
        onFechar={() => setCampanha(null)}
        onCriada={(r) => {
          setCampanha(null);
          setMsgOk(`${r.gerados} cliente${r.gerados === 1 ? '' : 's'} na fila. Confira em Para enviar.`);
          onFilaMudou?.();
        }} />
    </div>
  );
}
