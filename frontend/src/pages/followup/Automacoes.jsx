import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wrench, Star, RotateCcw, Megaphone, Check, Plus, Pencil, Trash2, Cake, ClipboardCheck,
  UserX, Send, Eye, Search, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Skeleton, Alerta, Modal, Spinner, Confirmar } from '../../components/ui';

/**
 * Automações do follow-up.
 *  - Quatro cartões fixos (Revisão, Pós-serviço, Reativação, Campanha).
 *  - Automações da oficina: criadas aqui, com gatilho (depois de um
 *    serviço, cliente sumido, aniversário, campanha), filtro de carro
 *    (câmbio, ano, marca, modelo) e mensagem própria.
 * Em cada uma o dono escolhe se a mensagem espera revisão em Para enviar
 * ou se sai sozinha (às 8h; na campanha, assim que é montada).
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

const GATILHOS = {
  servico_feito: {
    Icone: ClipboardCheck, titulo: 'Depois de um serviço',
    exemplo: 'Ex.: 15 dias depois da troca de fluido do câmbio, perguntar se está tudo certo.',
    variaveis: ['nome_cliente', 'modelo_carro', 'placa', 'servico', 'dias_desde', 'oficina'],
    texto: 'Olá {nome_cliente}! Aqui é da {oficina}.\n\nFaz {dias_desde} dias que fizemos {servico} no seu {modelo_carro}. Está tudo certo?',
  },
  sumido: {
    Icone: UserX, titulo: 'Cliente sumido',
    exemplo: 'Ex.: quem não aparece há 90 dias recebe um texto; há 1 ano, outro.',
    variaveis: ['nome_cliente', 'modelo_carro', 'dias_desde', 'oficina'],
    texto: 'Olá {nome_cliente}! Aqui é da {oficina}. Faz um tempo que não vemos o seu {modelo_carro} por aqui.\n\nSe precisar de alguma coisa, é só chamar.',
  },
  aniversario: {
    Icone: Cake, titulo: 'Aniversário do cliente',
    exemplo: 'No dia do aniversário. Usa a data de nascimento do cadastro do cliente.',
    variaveis: ['nome_cliente', 'modelo_carro', 'oficina'],
    texto: 'Feliz aniversário, {nome_cliente}! 🎉\n\nA equipe da {oficina} deseja um ótimo dia.',
  },
  campanha: {
    Icone: Megaphone, titulo: 'Campanha para um grupo',
    exemplo: 'Ex.: promoção de fluido de câmbio só para carros automáticos 2018 ou mais novos.',
    variaveis: ['nome_cliente', 'modelo_carro', 'placa', 'oficina'],
    texto: 'Olá {nome_cliente}! Aqui é da {oficina}.\n\n',
  },
};

const CAMBIOS = [
  ['automatico', 'Automático'], ['cvt', 'CVT'], ['automatizado', 'Automatizado'], ['manual', 'Manual'],
];

function renderizar(texto, ctx) {
  return String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (k in ctx ? ctx[k] : m));
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Frase curta com o filtro de carro: "câmbio automático ou CVT, 2018 ou mais novo". */
function resumoCarro(f = {}) {
  const partes = [];
  if (f.cambios?.length) {
    const nomes = f.cambios.map((c) => (c === 'cvt' ? 'CVT' : (CAMBIOS.find(([k]) => k === c)?.[1] || c).toLowerCase()));
    partes.push(`câmbio ${nomes.join(' ou ')}`);
  }
  if (f.ano_min && f.ano_max) partes.push(`ano ${f.ano_min} a ${f.ano_max}`);
  else if (f.ano_min) partes.push(`${f.ano_min} ou mais novo`);
  else if (f.ano_max) partes.push(`até ${f.ano_max}`);
  if (f.marca) partes.push(f.marca);
  if (f.modelo) partes.push(f.modelo);
  return partes.join(', ');
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

/** Revisar antes x enviar sozinho. */
function ModoEnvio({ automatico, onChange, campanha, disabled, nome }) {
  const opcoes = [
    [false, Eye, 'Revisar antes', 'Cai em Para enviar e você manda com um clique.'],
    [true, Send, campanha ? 'Enviar ao montar' : 'Enviar sozinho',
      campanha ? 'Ao montar a campanha, já começa a enviar.' : 'Sai pelo WhatsApp às 8h, sem revisão.'],
  ];
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Como enviar {nome}</legend>
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {opcoes.map(([valor, Icone, rotulo, ajuda]) => (
          <button key={rotulo} type="button" title={ajuda} aria-pressed={automatico === valor}
            onClick={() => automatico !== valor && onChange(valor)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500 disabled:opacity-50
              ${automatico === valor
                ? (valor ? 'bg-ouro-500 text-painel-900' : 'bg-maninho-600 text-white')
                : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icone className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
          </button>
        ))}
      </div>
    </fieldset>
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

/** Texto da mensagem com botões de variável e a prévia ao lado. */
function EditorMensagem({ id, valor, onChange, variaveis, ctx, disabled, rotulo = 'Mensagem' }) {
  const area = useRef(null);
  function inserir(v) {
    const el = area.current;
    const token = `{${v}}`;
    if (!el) { onChange(valor + token); return; }
    const ini = el.selectionStart ?? valor.length;
    const fim = el.selectionEnd ?? ini;
    onChange(valor.slice(0, ini) + token + valor.slice(fim));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini + token.length, ini + token.length); });
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-600">{rotulo}</label>
        <textarea id={id} ref={area} className="input min-h-[150px] resize-y text-[13px] leading-relaxed"
          value={valor} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        {!disabled && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {variaveis.map((v) => (
              <button key={v} type="button" onClick={() => inserir(v)}
                className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-maninho-500 hover:text-maninho-700">
                + {ROTULO_VARIAVEL[v]}
              </button>
            ))}
          </div>
        )}
      </div>
      <Previa texto={renderizar(valor, ctx)} />
    </div>
  );
}

function ModalCampanha({ alvo, onFechar, ctx, onCriada }) {
  const aberto = alvo !== null;
  const [mensagem, setMensagem] = useState('');
  const [previa, setPrevia] = useState(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setMensagem(alvo.mensagem || ''); setPrevia(null); setErro('');
    api.followupCampanha({ regra_id: alvo.regra_id }).then(setPrevia).catch((e) => setErro(e.message));
  }, [aberto, alvo]);

  async function criar() {
    setCriando(true); setErro('');
    try {
      const r = await api.followupCampanha({ regra_id: alvo.regra_id, mensagem, confirmar: true });
      onCriada(r);
    } catch (e) { setErro(e.message); }
    finally { setCriando(false); }
  }

  const n = previa?.publico || 0;
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={alvo?.nome ? `Montar: ${alvo.nome}` : 'Montar campanha'}
      largura="max-w-2xl">
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      <p className="mb-1 text-sm text-slate-600">
        {previa === null
          ? 'Contando o público…'
          : n === 0
            ? `Nenhum cliente se encaixa agora.${alvo?.filtro
              ? ' Só entram carros com câmbio e ano preenchidos no cadastro.'
              : ''} Quem recebeu esta campanha nos últimos 30 dias também fica de fora.`
            : alvo?.automatico
              ? `${plural(n, 'cliente', 'clientes')} no público. O envio começa assim que você confirmar (até 100 por vez, com intervalo).`
              : `${plural(n, 'cliente vai', 'clientes vão')} para a fila. Você ainda revisa antes de enviar.`}
      </p>
      {alvo?.filtro && <p className="mb-3 text-xs text-slate-500">Filtro: {alvo.filtro}</p>}
      <EditorMensagem id="msg-campanha" valor={mensagem} onChange={setMensagem} ctx={ctx}
        rotulo="Mensagem desta campanha" variaveis={GATILHOS.campanha.variaveis} />
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
        <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-ouro"
          disabled={criando || !n || mensagem.trim().length < 10} onClick={criar}>
          {criando ? <Spinner className="h-4 w-4" /> : null}
          {alvo?.automatico ? `Enviar para ${n || ''}` : `Colocar ${n || ''} na fila`}
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

  useEffect(() => {
    setForm({ prazo: a[meta.campo], mensagem: a.mensagem_template });
  }, [a, meta.campo]);

  const mudou = Number(form.prazo) !== Number(a[meta.campo]) || form.mensagem !== a.mensagem_template;

  async function salvar(campos) {
    setSalvando(true); setErro('');
    try {
      onSalvo(await api.atualizarFollowupAutomacao(a.chave, campos));
      if (!('ativo' in campos) && !('envio_automatico' in campos)) {
        setSalvoAgora(true);
        setTimeout(() => setSalvoAgora(false), 2000);
      }
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
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
            <h3 className="text-base font-semibold text-slate-800">{meta.titulo}</h3>
            <span className="text-xs text-slate-400">
              {a.gerados_30d ? `${a.gerados_30d} na fila nos últimos 30 dias` : 'nada nos últimos 30 dias'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{meta.resumo}</p>
        </div>
        {!ehCampanha && ehAdmin && (
          <Interruptor ligado={a.ativo} onChange={(v) => salvar({ ativo: v })} disabled={salvando}
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
            : `${plural(info.servicos, 'serviço', 'serviços')} e ${plural(info.pecas, 'peça', 'peças')} com intervalo de retorno. `}
          <Link to="/servicos" className="font-semibold text-maninho-700 hover:underline">Ajustar no catálogo</Link>
        </p>
      )}

      <div className="mt-4">
        <EditorMensagem id={`msg-${a.chave}`} valor={form.mensagem} ctx={ctx} disabled={!ehAdmin}
          rotulo={ehCampanha ? 'Mensagem padrão' : 'Mensagem'} variaveis={meta.variaveis}
          onChange={(m) => setForm((f) => ({ ...f, mensagem: m }))} />
      </div>

      {ehAdmin && (
        <footer className="mt-4 flex flex-wrap items-center gap-2">
          <ModoEnvio automatico={a.envio_automatico} campanha={ehCampanha} disabled={salvando} nome={meta.titulo}
            onChange={(v) => salvar({ envio_automatico: v })} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
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
              disabled={!mudou || salvando}
              onClick={() => salvar({ [meta.campo]: Number(form.prazo), mensagem_template: form.mensagem })}>
              {salvando ? <Spinner className="h-4 w-4" /> : null} Salvar
            </button>
            {ehCampanha && (
              <button type="button" className="btn-ouro"
                onClick={() => onCampanha({ mensagem: form.mensagem, automatico: a.envio_automatico })}>
                <Megaphone className="h-4 w-4" /> Montar campanha
              </button>
            )}
          </div>
        </footer>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- automações próprias

/** Lista com busca e caixas de seleção (serviços e peças do catálogo). */
function EscolherItens({ catalogo, servicos, pecas, onChange }) {
  const [busca, setBusca] = useState('');
  const itens = useMemo(() => [
    ...catalogo.servicos.map((s) => ({ ...s, tipo: 'servico' })),
    ...catalogo.pecas.map((p) => ({ ...p, tipo: 'peca' })),
  ], [catalogo]);
  const marcado = (i) => (i.tipo === 'servico' ? servicos : pecas).includes(i.id);
  const visiveis = itens.filter((i) => !busca || i.nome.toLowerCase().includes(busca.toLowerCase()));
  const escolhidos = itens.filter(marcado);

  function alternar(i) {
    const lista = i.tipo === 'servico' ? servicos : pecas;
    const nova = lista.includes(i.id) ? lista.filter((x) => x !== i.id) : [...lista, i.id];
    onChange(i.tipo === 'servico' ? { servico_ids: nova, peca_ids: pecas } : { servico_ids: servicos, peca_ids: nova });
  }

  return (
    <div className="rounded-lg border border-slate-200">
      {escolhidos.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
          {escolhidos.map((i) => (
            <button key={`${i.tipo}-${i.id}`} type="button" onClick={() => alternar(i)}
              className="inline-flex items-center gap-1 rounded-full bg-maninho-50 px-2 py-0.5 text-xs font-medium text-maninho-700 hover:bg-maninho-100"
              aria-label={`Tirar ${i.nome}`}>
              {i.nome} <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <label className="relative block border-b border-slate-200">
        <span className="sr-only">Buscar serviço ou peça</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="w-full rounded-t-lg border-0 bg-transparent py-2 pl-9 pr-3 text-sm text-slate-800 focus:outline-none focus:ring-0"
          placeholder="Buscar serviço ou peça" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      <ul className="max-h-44 overflow-y-auto py-1">
        {visiveis.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">Nada encontrado no catálogo.</li>}
        {visiveis.map((i) => (
          <li key={`${i.tipo}-${i.id}`}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" className="h-4 w-4 accent-maninho-600" checked={marcado(i)} onChange={() => alternar(i)} />
              <span className="flex-1 text-slate-700">{i.nome}</span>
              <span className="text-[11px] text-slate-400">{i.tipo === 'servico' ? 'serviço' : 'peça'}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Câmbio, ano, marca e modelo. Vazio = todos os carros. */
function FiltroCarro({ f, onChange }) {
  const set = (k, v) => onChange({ ...f, [k]: v });
  const cambios = f.cambios || [];
  const resumo = resumoCarro(f);
  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-600">Só para estes carros</legend>
      <div>
        <p className="mb-1.5 text-xs text-slate-500">Câmbio</p>
        <div className="flex flex-wrap gap-1.5">
          {CAMBIOS.map(([k, nome]) => {
            const on = cambios.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on}
                onClick={() => set('cambios', on ? cambios.filter((x) => x !== k) : [...cambios, k])}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500
                  ${on ? 'border-maninho-600 bg-maninho-600 text-white' : 'border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                {nome}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Ano a partir de</span>
          <input type="number" min={1950} max={2100} className="input tabular-nums" placeholder="ex.: 2018"
            value={f.ano_min ?? ''} onChange={(e) => set('ano_min', e.target.value ? Number(e.target.value) : null)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Ano até</span>
          <input type="number" min={1950} max={2100} className="input tabular-nums" placeholder="qualquer"
            value={f.ano_max ?? ''} onChange={(e) => set('ano_max', e.target.value ? Number(e.target.value) : null)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Marca</span>
          <input className="input" placeholder="qualquer" maxLength={60}
            value={f.marca || ''} onChange={(e) => set('marca', e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Modelo</span>
          <input className="input" placeholder="qualquer" maxLength={60}
            value={f.modelo || ''} onChange={(e) => set('modelo', e.target.value)} />
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        {resumo
          ? `Só entra: ${resumo}. Carro sem câmbio ou ano no cadastro fica de fora.`
          : 'Sem filtro: vale para qualquer carro.'}
      </p>
    </fieldset>
  );
}

const VAZIO = {
  nome: '', gatilho: null, intervalo_dias: 15, mensagem_template: '', ativo: true,
  envio_automatico: false, filtros: {},
};

function EditorAutomacao({ automacao, aberto, catalogo, ctx, onFechar, onSalva }) {
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setForm(automacao ? { ...VAZIO, ...automacao, filtros: automacao.filtros || {} } : VAZIO);
  }, [aberto, automacao]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setFiltros = (parcial) => setForm((f) => ({ ...f, filtros: { ...f.filtros, ...parcial } }));
  const g = form.gatilho && GATILHOS[form.gatilho];

  function escolher(gatilho) {
    const padrao = { servico_feito: 15, sumido: 90, aniversario: 1, campanha: 1 }[gatilho];
    setForm((f) => ({
      ...f, gatilho, intervalo_dias: padrao,
      nome: f.nome || GATILHOS[gatilho].titulo,
      mensagem_template: GATILHOS[gatilho].texto,
    }));
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro('');
    const f = form.filtros;
    const filtros = {
      ...(form.gatilho === 'servico_feito' ? { servico_ids: f.servico_ids || [], peca_ids: f.peca_ids || [] } : {}),
      ...(form.gatilho === 'campanha' ? {
        servico_ids: f.servico_ids || [], visita: f.visita || 'qualquer', visita_dias: f.visita_dias || 180,
      } : {}),
      cambios: f.cambios || [],
      ano_min: f.ano_min || null,
      ano_max: f.ano_max || null,
      marca: (f.marca || '').trim() || undefined,
      modelo: (f.modelo || '').trim() || undefined,
    };
    const corpo = {
      nome: form.nome.trim(), intervalo_dias: Number(form.intervalo_dias) || 1,
      mensagem_template: form.mensagem_template, envio_automatico: form.envio_automatico, filtros,
    };
    try {
      const salva = automacao
        ? await api.atualizarFollowupAutomacao(automacao.id, corpo)
        : await api.criarFollowupAutomacao({ ...corpo, gatilho: form.gatilho, ativo: true });
      onSalva(salva, !automacao);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  const titulo = automacao ? `Editar: ${automacao.nome}` : g ? `Nova automação: ${g.titulo}` : 'Nova automação';

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={titulo} largura="max-w-3xl">
      {!form.gatilho ? (
        <div>
          <p className="mb-3 text-sm text-slate-600">Quando a mensagem deve sair?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(GATILHOS).map(([k, { Icone, titulo: t, exemplo }]) => (
              <button key={k} type="button" onClick={() => escolher(k)}
                className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-maninho-500 hover:bg-maninho-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-maninho-50 text-maninho-700">
                  <Icone className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{t}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{exemplo}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={salvar} className="space-y-4">
          {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Nome (só você vê)</span>
            <input className="input" value={form.nome} maxLength={60} required
              onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Fluido de câmbio 15 dias" />
          </label>

          {form.gatilho === 'servico_feito' && (
            <div className="space-y-2">
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                Entra na fila
                <input type="number" min={1} max={3650} className="input h-8 w-20 px-2 text-center tabular-nums"
                  aria-label="Dias depois do serviço" value={form.intervalo_dias}
                  onChange={(e) => set('intervalo_dias', e.target.value)} />
                dias depois de a OS ser paga ou finalizada com um destes itens:
              </p>
              <EscolherItens catalogo={catalogo} servicos={form.filtros.servico_ids || []}
                pecas={form.filtros.peca_ids || []} onChange={setFiltros} />
            </div>
          )}

          {form.gatilho === 'sumido' && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              Entra na fila quando o cliente está há
              <input type="number" min={1} max={3650} className="input h-8 w-20 px-2 text-center tabular-nums"
                aria-label="Dias sem abrir OS" value={form.intervalo_dias}
                onChange={(e) => set('intervalo_dias', e.target.value)} />
              dias sem abrir OS. Uma vez por sumiço.
            </p>
          )}

          {form.gatilho === 'aniversario' && (
            <p className="text-sm text-slate-700">
              Entra na fila no dia do aniversário do cliente. Preencha a data de nascimento no cadastro do cliente.
            </p>
          )}

          {form.gatilho === 'campanha' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">Só sai quando você clicar em Montar. Público:</p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <select className="input h-9 w-auto" value={form.filtros.visita || 'qualquer'}
                  aria-label="Última visita" onChange={(e) => setFiltros({ visita: e.target.value })}>
                  <option value="qualquer">Qualquer cliente</option>
                  <option value="recente">Atendidos nos últimos</option>
                  <option value="sumido">Sem vir há mais de</option>
                </select>
                {form.filtros.visita && form.filtros.visita !== 'qualquer' && (
                  <>
                    <input type="number" min={1} max={3650} className="input h-9 w-20 px-2 text-center tabular-nums"
                      aria-label="Dias" value={form.filtros.visita_dias ?? 180}
                      onChange={(e) => setFiltros({ visita_dias: Number(e.target.value) || 1 })} />
                    dias
                  </>
                )}
              </div>
              <details className="rounded-lg border border-slate-200 p-3" open={Boolean(form.filtros.servico_ids?.length)}>
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                  Só quem já fez algum destes serviços {form.filtros.servico_ids?.length ? `(${form.filtros.servico_ids.length})` : '(opcional)'}
                </summary>
                <div className="mt-2">
                  <EscolherItens catalogo={{ servicos: catalogo.servicos, pecas: [] }}
                    servicos={form.filtros.servico_ids || []} pecas={[]}
                    onChange={({ servico_ids }) => setFiltros({ servico_ids })} />
                </div>
              </details>
            </div>
          )}

          <FiltroCarro f={form.filtros} onChange={(f) => setForm((x) => ({ ...x, filtros: f }))} />

          <EditorMensagem id="msg-nova" valor={form.mensagem_template} ctx={ctx} variaveis={g.variaveis}
            onChange={(m) => set('mensagem_template', m)} />

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
            <ModoEnvio automatico={form.envio_automatico} campanha={form.gatilho === 'campanha'} nome={form.nome}
              onChange={(v) => set('envio_automatico', v)} />
            <div className="ml-auto flex gap-2">
              {!automacao && (
                <button type="button" className="btn-ghost" onClick={() => set('gatilho', null)}>Voltar</button>
              )}
              <button type="submit" className="btn-primary"
                disabled={salvando || form.nome.trim().length < 2 || form.mensagem_template.trim().length < 10}>
                {salvando ? <Spinner className="h-4 w-4" /> : null}
                {automacao ? 'Salvar' : 'Criar automação'}
              </button>
            </div>
          </div>
          {form.envio_automatico && (
            <p className="text-xs text-ouro-700">
              {form.gatilho === 'campanha'
                ? 'Ao montar, as mensagens saem sem revisão (até 100 por vez, com intervalo entre elas).'
                : 'As mensagens saem sozinhas às 8h, sem revisão (até 100 por dia, com intervalo entre elas).'}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}

/** Frase que diz quando a automação dispara. */
function quando(a, catalogo) {
  const f = a.filtros || {};
  if (a.gatilho === 'servico_feito') {
    const nomes = [
      ...catalogo.servicos.filter((s) => f.servico_ids?.includes(s.id)),
      ...catalogo.pecas.filter((p) => f.peca_ids?.includes(p.id)),
    ].map((i) => i.nome);
    const itens = nomes.length > 2 ? `${nomes.slice(0, 2).join(', ')} e mais ${nomes.length - 2}` : nomes.join(' ou ');
    return `${plural(a.intervalo_dias, 'dia', 'dias')} depois de ${itens || 'serviço escolhido'}`;
  }
  if (a.gatilho === 'sumido') return `Cliente há ${a.intervalo_dias} dias sem abrir OS`;
  if (a.gatilho === 'aniversario') return 'No dia do aniversário do cliente';
  const v = f.visita === 'recente' ? `atendidos nos últimos ${f.visita_dias} dias`
    : f.visita === 'sumido' ? `sem vir há mais de ${f.visita_dias} dias` : 'qualquer cliente';
  return `Campanha: ${v}${f.servico_ids?.length ? `, que já fizeram ${plural(f.servico_ids.length, 'serviço escolhido', 'serviços escolhidos')}` : ''}`;
}

function CartaoProprio({ a, catalogo, ehAdmin, onEditar, onAlterar, onApagar, onCampanha, onGerar }) {
  const { Icone } = GATILHOS[a.gatilho];
  const [ocupado, setOcupado] = useState(false);
  const carro = resumoCarro(a.filtros);
  const ehCampanha = a.gatilho === 'campanha';
  const ativo = ehCampanha || a.ativo;

  async function rodar(fn) {
    setOcupado(true);
    try { await fn(); } finally { setOcupado(false); }
  }

  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-white px-4 py-3 ${ativo ? 'border-slate-200' : 'border-dashed border-slate-300'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ativo ? 'bg-maninho-50 text-maninho-700' : 'bg-slate-100 text-slate-400'}`}>
        <Icone className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-slate-800">{a.nome}</span>
          <span className={`text-[11px] font-semibold ${a.envio_automatico ? 'text-ouro-700' : 'text-slate-400'}`}>
            {a.envio_automatico ? (ehCampanha ? 'envia ao montar' : 'envia sozinho às 8h') : 'revisar antes'}
          </span>
        </p>
        <p className="text-sm text-slate-600">{quando(a, catalogo)}</p>
        <p className="text-xs text-slate-400">
          {carro ? `Carros: ${carro}` : 'Qualquer carro'}
          {'. '}
          {a.gerados_30d ? `${a.gerados_30d} na fila nos últimos 30 dias` : 'Nada nos últimos 30 dias'}
        </p>
      </div>
      {ehAdmin && (
        <div className="flex items-center gap-1">
          {ehCampanha ? (
            <button type="button" className="btn-ouro h-8 px-3 text-xs" onClick={onCampanha}>
              <Megaphone className="h-3.5 w-3.5" /> Montar
            </button>
          ) : (
            <>
              <button type="button" className="btn-ghost h-8 px-3 text-xs" disabled={!a.ativo || ocupado}
                title="Procura agora quem se encaixa e coloca na fila" onClick={() => rodar(onGerar)}>
                {ocupado ? <Spinner className="h-3.5 w-3.5" /> : null} Rodar agora
              </button>
              <Interruptor ligado={a.ativo} disabled={ocupado} rotulo={`${a.ativo ? 'Desligar' : 'Ligar'} ${a.nome}`}
                onChange={(v) => rodar(() => onAlterar({ ativo: v }))} />
            </>
          )}
          <button type="button" onClick={onEditar} aria-label={`Editar ${a.nome}`} title="Editar"
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={onApagar} aria-label={`Apagar ${a.nome}`} title="Apagar"
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maninho-500">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}

export default function Automacoes({ ehAdmin, onFilaMudou }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [campanha, setCampanha] = useState(null); // { regra_id?, nome?, mensagem, automatico, filtro? }
  const [editor, setEditor] = useState(null); // null fechado; {} nova; { automacao }
  const [confirmar, setConfirmar] = useState(null);

  useEffect(() => {
    api.followupAutomacoes().then(setDados).catch((e) => setErro(e.message));
  }, []);

  function aoSalvarFixa(atualizado) {
    setDados((d) => ({ ...d, automacoes: d.automacoes.map((a) => (a.chave === atualizado.chave ? atualizado : a)) }));
  }

  function aoSalvarPropria(a, nova) {
    setDados((d) => ({
      ...d,
      personalizadas: nova ? [...d.personalizadas, a] : d.personalizadas.map((x) => (x.id === a.id ? a : x)),
    }));
  }

  async function alterar(a, campos) {
    try { aoSalvarPropria(await api.atualizarFollowupAutomacao(a.id, campos), false); }
    catch (e) { setErro(e.message); }
  }

  async function gerar(a) {
    try {
      const r = await api.gerarFollowupDaAutomacao(a.id);
      setMsgOk(r.gerados
        ? `${a.nome}: ${plural(r.gerados, 'cliente entrou', 'clientes entraram')} na fila.`
        : `${a.nome}: ninguém se encaixa agora.`);
      if (r.gerados) onFilaMudou?.();
      setDados((d) => ({
        ...d,
        personalizadas: d.personalizadas.map((x) => (x.id === a.id ? { ...x, gerados_30d: (x.gerados_30d || 0) + r.gerados } : x)),
      }));
    } catch (e) { setErro(e.message); }
  }

  function apagar(a) {
    setConfirmar({
      titulo: 'Apagar automação',
      mensagem: `"${a.nome}" para de rodar. O que ela já colocou na fila e ainda não foi enviado também é apagado.`,
      rotulo: 'Apagar', tom: 'perigo',
      onConfirmar: async () => {
        try {
          await api.removerFollowupAutomacao(a.id);
          setDados((d) => ({ ...d, personalizadas: d.personalizadas.filter((x) => x.id !== a.id) }));
          onFilaMudou?.();
        } catch (e) { setErro(e.message); }
      },
    });
  }

  const ctx = { ...EXEMPLO, oficina: dados?.oficina || 'sua oficina' };
  const catalogo = dados?.catalogo || { servicos: [], pecas: [] };

  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-sm text-slate-500">
        O sistema monta a fila todo dia às 8h com o que está ligado aqui. Em cada automação você escolhe:
        revisar antes de enviar ou deixar sair sozinha pelo WhatsApp.
      </p>
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {msgOk && <Alerta tipo="ok" onFechar={() => setMsgOk('')}>{msgOk}</Alerta>}

      {!dados ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}</div>
      ) : (
        <>
          <section aria-labelledby="titulo-proprias" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="titulo-proprias" className="font-display text-lg font-semibold text-slate-800">Suas automações</h2>
              {ehAdmin && (
                <button type="button" className="btn-primary" onClick={() => setEditor({})}>
                  <Plus className="h-4 w-4" /> Criar automação
                </button>
              )}
            </div>
            {dados.personalizadas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                Crie mensagens do seu jeito: depois de um serviço específico, para quem sumiu, no aniversário
                do cliente ou uma campanha só para um grupo (ex.: câmbio automático, 2018 ou mais novo).
              </div>
            ) : (
              <ul className="space-y-2">
                {dados.personalizadas.map((a) => (
                  <CartaoProprio key={a.id} a={a} catalogo={catalogo} ehAdmin={ehAdmin}
                    onEditar={() => setEditor({ automacao: a })}
                    onAlterar={(campos) => alterar(a, campos)}
                    onApagar={() => apagar(a)}
                    onGerar={() => gerar(a)}
                    onCampanha={() => setCampanha({
                      regra_id: a.id, nome: a.nome, mensagem: a.mensagem_template,
                      automatico: a.envio_automatico, filtro: resumoCarro(a.filtros),
                    })} />
                ))}
              </ul>
            )}
          </section>

          <h2 className="pt-2 font-display text-lg font-semibold text-slate-800">Automações prontas</h2>
          {dados.automacoes.map((a) => (
            <Cartao key={a.chave} a={a} info={dados.catalogo_com_intervalo} ctx={ctx} ehAdmin={ehAdmin}
              onSalvo={aoSalvarFixa} onCampanha={(c) => setCampanha(c)} />
          ))}
        </>
      )}

      <ModalCampanha alvo={campanha} ctx={ctx}
        onFechar={() => setCampanha(null)}
        onCriada={(r) => {
          setCampanha(null);
          const enviando = r.envio && !r.envio.erro;
          setMsgOk(enviando
            ? `${plural(r.gerados, 'mensagem', 'mensagens')} na fila. O envio começou: acompanhe na aba Fila.`
            : `${plural(r.gerados, 'cliente', 'clientes')} na fila. Confira em Para enviar.${r.envio?.erro ? ` Não deu para enviar sozinho: ${r.envio.erro}` : ''}`);
          onFilaMudou?.();
        }} />

      <EditorAutomacao aberto={editor !== null} automacao={editor?.automacao || null}
        catalogo={catalogo} ctx={ctx}
        onFechar={() => setEditor(null)}
        onSalva={(a, nova) => {
          setEditor(null);
          aoSalvarPropria(a, nova);
          setMsgOk(nova ? `Automação "${a.nome}" criada.` : 'Automação salva.');
        }} />

      <Confirmar dados={confirmar} onFechar={() => setConfirmar(null)} />
    </div>
  );
}
