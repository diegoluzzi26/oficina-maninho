import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import { chave, maisParecido } from '../lib/semelhanca';
import { Alerta, Campo, Modal, Spinner } from './ui';

/**
 * Aviso embaixo do campo de peça na OS: o nome digitado não está no
 * catálogo, mas existe um parecido. Evita criar "Lampadas" ao lado de
 * "Lâmpada" (que já tem NCM). Mesmo nome normalizado o servidor já
 * reaproveita sozinho; aqui só avisa.
 */
export function DicaPecaParecida({ nome, catalogo, onUsar }) {
  const n = String(nome || '').trim();
  if (n.length < 3 || !catalogo?.length) return null;
  if (catalogo.some((p) => p.nome.toLowerCase() === n.toLowerCase())) return null;
  const k = chave(n);
  const igual = catalogo.find((p) => chave(p.nome) === k);
  if (igual) {
    return (
      <p className="w-full text-[11px] text-slate-500">
        Vai usar <b>{igual.nome}</b> do catálogo.
      </p>
    );
  }
  const achou = maisParecido(n, catalogo);
  if (!achou) return null;
  return (
    <p className="w-full text-[11px] text-ouro-700">
      Parecida com <b>{achou.item.nome}</b> do catálogo.{' '}
      <button type="button" className="font-semibold underline" onClick={() => onUsar(achou.item)}>
        Usar essa
      </button>
      {' '}ou siga para cadastrar uma peça nova.
    </p>
  );
}

/**
 * Peças do catálogo prontas pra NF-e: edição com NCM/CEST (busca na tabela
 * oficial) e junção de peças com nomes parecidos.
 */

// 87083090 -> 8708.30.90 (só exibição; o servidor guarda os dígitos).
export const ncmBR = (c) => (c && c.length === 8 ? `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}` : c || '');
const cestBR = (c) => (c && c.length === 7 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5)}` : c || '');

/** Lista de códigos NCM clicáveis, com o caminho na tabela oficial. */
function ListaNcm({ itens, selecionado, onEscolher }) {
  if (!itens.length) return <p className="py-2 text-xs text-slate-500">Nenhum código encontrado.</p>;
  return (
    <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
      {itens.map((n) => {
        const niveis = n.descricao_completa.split(' > ');
        return (
          <li key={n.codigo}>
            <button type="button" onClick={() => onEscolher(n.codigo)}
              className={`block w-full px-3 py-2 text-left text-xs transition hover:bg-maninho-50
                ${selecionado === n.codigo ? 'bg-maninho-50' : ''}`}>
              <span className="font-mono font-semibold text-maninho-700">{ncmBR(n.codigo)}</span>
              <span className="ml-2 text-slate-800">{niveis[niveis.length - 1]}</span>
              {niveis.length > 1 && (
                <span className="mt-0.5 block truncate text-[11px] text-slate-500" title={n.descricao_completa}>
                  {niveis.slice(-3, -1).join(' › ')}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Campo de NCM: sugestões pelo nome da peça + busca livre por palavra ou código. */
function SeletorNcm({ pecaId, valor, onChange }) {
  const [sugestoes, setSugestoes] = useState(null);
  const [termo, setTermo] = useState('');
  const [resultado, setResultado] = useState(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    api.sugestoesNcm(pecaId).then(setSugestoes).catch(() => setSugestoes([]));
  }, [pecaId]);

  async function buscar(e) {
    e?.preventDefault();
    if (termo.trim().length < 2) return;
    setBuscando(true);
    try { setResultado(await api.buscarNcm(termo.trim())); } catch { setResultado([]); }
    finally { setBuscando(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Campo label="NCM" ajuda="8 dígitos. Obrigatório para a peça sair em NF-e">
          <input className="input w-40 font-mono" value={ncmBR(valor)} maxLength={10}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="0000.00.00" />
        </Campo>
        {valor && (
          <button type="button" className="btn-ghost mb-[18px] px-2 py-1 text-xs" onClick={() => onChange('')}>Limpar</button>
        )}
      </div>

      <div>
        <p className="label mb-1.5">Sugestões pelo nome da peça</p>
        {sugestoes === null
          ? <p className="text-xs text-slate-500"><Spinner className="mr-1 inline h-3 w-3" />Procurando…</p>
          : <ListaNcm itens={sugestoes} selecionado={valor} onEscolher={onChange} />}
      </div>

      <div>
        <p className="label mb-1.5">Buscar na tabela oficial</p>
        <div className="flex gap-2">
          <input className="input flex-1" value={termo} onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscar(e); }}
            placeholder="Palavra (ex. amortecedor) ou início do código (ex. 8708)" />
          <button type="button" className="btn-ghost" onClick={buscar} disabled={buscando || termo.trim().length < 2}>
            {buscando ? <Spinner className="h-4 w-4" /> : <Search size={16} aria-hidden="true" />}
          </button>
        </div>
        {resultado && <div className="mt-2"><ListaNcm itens={resultado} selecionado={valor} onEscolher={onChange} /></div>}
      </div>

      <p className="text-[11px] text-slate-500">
        Sugestões vêm da tabela NCM oficial (Siscomex). Confirme o código com o contador: NCM errado
        pode gerar rejeição da nota ou imposto errado.
      </p>
    </div>
  );
}

/** Editar uma peça do catálogo, incluindo os dados fiscais. */
export function ModalPeca({ peca, onFechar, onSalvo }) {
  const [form, setForm] = useState(() => ({
    nome: peca.nome,
    valor_padrao: String(peca.valor_padrao ?? ''),
    intervalo_retorno_meses: String(peca.intervalo_retorno_meses ?? ''),
    ncm: peca.ncm || '',
    cest: peca.cest || '',
    unidade: peca.unidade || '',
  }));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      onSalvo(await api.atualizarPeca(peca.id, {
        nome: form.nome.trim(),
        valor_padrao: Number(form.valor_padrao || 0),
        intervalo_retorno_meses: form.intervalo_retorno_meses ? Number(form.intervalo_retorno_meses) : null,
        ncm: form.ncm,
        cest: form.cest.replace(/\D/g, ''),
        unidade: form.unidade,
      }));
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto largura="max-w-2xl" titulo={`Peça · ${peca.nome}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Campo label="Nome" obrigatorio>
              <input className="input" value={form.nome} onChange={set('nome')} required minLength={2} />
            </Campo>
          </div>
          <Campo label="Valor padrão">
            <input type="number" step="0.01" min="0" className="input tnum" value={form.valor_padrao}
              onChange={set('valor_padrao')} />
          </Campo>
          <Campo label="Retorno (meses)" ajuda="Lembrete de troca">
            <input type="number" min="1" max="120" className="input" value={form.intervalo_retorno_meses}
              onChange={set('intervalo_retorno_meses')} />
          </Campo>
          <Campo label="Unidade" ajuda="UN, PC, LT, KG…">
            <input className="input uppercase" value={form.unidade} onChange={set('unidade')} maxLength={6}
              placeholder="UN" />
          </Campo>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">Dados fiscais (NF-e)</p>
          <SeletorNcm pecaId={peca.id} valor={form.ncm} onChange={(ncm) => setForm((f) => ({ ...f, ncm }))} />
          <div className="mt-4">
            <Campo label="CEST" ajuda="7 dígitos. Autopeças em substituição tributária costumam exigir (ex. 01.075.00)">
              <input className="input w-40 font-mono" value={cestBR(form.cest)} maxLength={9}
                onChange={(e) => setForm((f) => ({ ...f, cest: e.target.value.replace(/\D/g, '').slice(0, 7) }))}
                placeholder="00.000.00" />
            </Campo>
          </div>
        </div>

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

/** Uma peça no lote: marcar, escolher entre as sugestões ou digitar outro NCM. */
function LinhaLote({ item, escolha, onMudar }) {
  const [outro, setOutro] = useState(false);
  const sel = item.sugestoes.find((s) => s.codigo === escolha.ncm);
  const ultimo = (s) => s.descricao_completa.split(' > ').slice(-1)[0];
  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <input type="checkbox" className="mt-1" checked={escolha.marcada}
        disabled={!/^\d{8}$/.test(escolha.ncm)}
        onChange={(e) => onMudar({ ...escolha, marcada: e.target.checked })}
        aria-label={`Aplicar NCM em ${item.nome}`} />
      <div className="min-w-[160px] flex-1">
        <p className="text-sm font-semibold text-slate-800">{item.nome}</p>
        <p className="text-[11px] text-slate-500">{item.usos} uso{item.usos === 1 ? '' : 's'} em OS</p>
      </div>
      <div className="w-full min-w-0 space-y-1 sm:w-[330px]">
        {!outro ? (
          <select className="input py-1.5 text-xs" value={escolha.ncm}
            onChange={(e) => {
              if (e.target.value === '__outro') { setOutro(true); onMudar({ ncm: '', marcada: false }); return; }
              onMudar({ ncm: e.target.value, marcada: Boolean(e.target.value) });
            }}>
            {!item.sugestoes.length && <option value="">Sem sugestão — digite o NCM</option>}
            {item.sugestoes.map((s) => (
              <option key={s.codigo} value={s.codigo}>{ncmBR(s.codigo)} — {ultimo(s).slice(0, 70)}</option>
            ))}
            <option value="__outro">Outro código…</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input className="input flex-1 py-1.5 font-mono text-xs" value={ncmBR(escolha.ncm)} maxLength={10}
              placeholder="0000.00.00" autoFocus
              onChange={(e) => {
                const ncm = e.target.value.replace(/\D/g, '').slice(0, 8);
                onMudar({ ncm, marcada: ncm.length === 8 });
              }} />
            {item.sugestoes.length > 0 && (
              <button type="button" className="btn-ghost px-2 py-1 text-xs"
                onClick={() => { setOutro(false); onMudar({ ncm: item.sugestoes[0].codigo, marcada: true }); }}>
                Sugestões
              </button>
            )}
          </div>
        )}
        {sel && (
          <p className="truncate text-[11px] text-slate-500" title={sel.descricao_completa}>
            {sel.descricao_completa.split(' > ').slice(-3, -1).join(' › ')}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * NCM em lote: todas as peças sem NCM com a sugestão da tabela oficial já
 * escolhida. A oficina confere, troca o que estiver errado e aplica de uma
 * vez. Nada é gravado sem passar por aqui.
 */
export function ModalNcmLote({ onFechar, onAplicado }) {
  const [itens, setItens] = useState(null);
  const [escolhas, setEscolhas] = useState({});
  const [erro, setErro] = useState('');
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    api.ncmLote().then((lista) => {
      setItens(lista);
      setEscolhas(Object.fromEntries(lista.map((i) => [i.id, {
        ncm: i.sugestoes[0]?.codigo || '',
        marcada: false,
      }])));
    }).catch((e) => setErro(e.message));
  }, []);

  const marcadas = Object.entries(escolhas).filter(([, e]) => e.marcada && /^\d{8}$/.test(e.ncm));
  const comSugestao = itens?.filter((i) => i.sugestoes.length) || [];
  const marcarTodas = (v) => setEscolhas((es) => Object.fromEntries(Object.entries(es)
    .map(([id, e]) => [id, { ...e, marcada: v && /^\d{8}$/.test(e.ncm) }])));

  async function aplicar() {
    setErro(''); setAplicando(true);
    try {
      const r = await api.aplicarNcmLote(marcadas.map(([id, e]) => ({ id, ncm: e.ncm })));
      onAplicado(r, Object.fromEntries(marcadas.map(([id, e]) => [id, e.ncm])));
    } catch (err) { setErro(err.message); setAplicando(false); }
  }

  return (
    <Modal aberto largura="max-w-3xl" titulo="Preencher NCM das peças" onFechar={onFechar}>
      <p className="mb-3 text-sm text-slate-600">
        Cada peça sem NCM já vem com a sugestão da tabela oficial. <b>Confira</b> antes de marcar: NCM errado
        pode gerar rejeição da nota ou imposto errado. Na dúvida, deixe desmarcada e pergunte ao contador.
      </p>
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {itens === null && !erro && (
        <p className="py-6 text-center text-sm text-slate-500"><Spinner className="mr-2 inline h-4 w-4" />Buscando sugestões…</p>
      )}
      {itens?.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Todas as peças já têm NCM.</p>}
      {itens?.length > 0 && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-slate-500">{itens.length} peças sem NCM · {comSugestao.length} com sugestão</span>
            <button type="button" className="font-semibold text-maninho-600 hover:underline" onClick={() => marcarTodas(true)}>
              Marcar todas com sugestão
            </button>
            <button type="button" className="font-semibold text-slate-500 hover:underline" onClick={() => marcarTodas(false)}>
              Desmarcar todas
            </button>
          </div>
          <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200">
            {itens.map((i) => (
              <LinhaLote key={i.id} item={i} escolha={escolhas[i.id]}
                onMudar={(e) => setEscolhas((es) => ({ ...es, [i.id]: e }))} />
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>
        <button type="button" className="btn-primary" disabled={!marcadas.length || aplicando} onClick={aplicar}>
          {aplicando ? <><Spinner className="h-4 w-4" /> Aplicando…</> : `Aplicar NCM em ${marcadas.length} peça${marcadas.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  );
}

/** Um grupo de peças parecidas: escolhe qual fica e quais juntam nela. */
function GrupoParecidas({ grupo, onUnificado }) {
  const [principal, setPrincipal] = useState(grupo[0].id);
  const [marcadas, setMarcadas] = useState(() => new Set(grupo.slice(1).map((p) => p.id)));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const outras = grupo.filter((p) => p.id !== principal && marcadas.has(p.id)).map((p) => p.id);
  const alternar = (id) => setMarcadas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  async function juntar() {
    setErro(''); setSalvando(true);
    try {
      await api.unificarPecas(principal, outras);
      onUnificado(principal, outras);
    } catch (err) { setErro(err.message); setSalvando(false); }
  }

  return (
    <li className="space-y-2 p-4">
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      <ul className="space-y-1.5">
        {grupo.map((p) => {
          const ehPrincipal = p.id === principal;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5 text-xs text-slate-600" title="Fica esta">
                <input type="radio" name={`principal-${grupo[0].id}`} checked={ehPrincipal}
                  onChange={() => setPrincipal(p.id)} />
                fica
              </label>
              <label className={`flex items-center gap-1.5 text-xs ${ehPrincipal ? 'invisible' : 'text-slate-600'}`}>
                <input type="checkbox" checked={!ehPrincipal && marcadas.has(p.id)}
                  onChange={() => alternar(p.id)} disabled={ehPrincipal} />
                juntar
              </label>
              <span className={`flex-1 ${ehPrincipal ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{p.nome}</span>
              <span className="text-xs text-slate-500">{p.usos} uso{p.usos === 1 ? '' : 's'}</span>
              <span className="w-24 text-right font-mono text-xs text-slate-500">{p.ncm ? ncmBR(p.ncm) : 'sem NCM'}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={juntar}
          disabled={salvando || !outras.length}>
          {salvando ? <Spinner className="h-3.5 w-3.5" /> : null}
          Juntar {outras.length} em “{grupo.find((p) => p.id === principal)?.nome}”
        </button>
      </div>
    </li>
  );
}

/**
 * Grupos de peças com nomes parecidos. Juntar mantém o histórico: as OS
 * antigas passam a apontar pra peça que fica e as outras são desativadas.
 */
export function ModalParecidas({ onFechar, onAlterado }) {
  const [grupos, setGrupos] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.pecasParecidas().then(setGrupos).catch((e) => setErro(e.message));
  }, []);

  function unificado(principal, outras) {
    setGrupos((gs) => gs.filter((g) => !g.some((p) => p.id === principal)));
    onAlterado(principal, outras);
  }

  return (
    <Modal aberto largura="max-w-2xl" titulo="Peças com nomes parecidos" onFechar={onFechar}>
      <p className="mb-3 text-sm text-slate-600">
        Escolha qual nome <b>fica</b> e marque as que são a mesma peça. As OS antigas continuam iguais;
        só passam a contar na peça que ficou. Medidas diferentes (20A x 30A) nunca aparecem juntas.
      </p>
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {grupos === null && !erro && <p className="py-6 text-center text-sm text-slate-500"><Spinner className="mr-2 inline h-4 w-4" />Comparando nomes…</p>}
      {grupos?.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">Nenhuma peça parecida no catálogo.</p>
      )}
      {grupos?.length > 0 && (
        <ul className="max-h-[60vh] divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
          {grupos.map((g) => <GrupoParecidas key={g[0].id} grupo={g} onUnificado={unificado} />)}
        </ul>
      )}
    </Modal>
  );
}
