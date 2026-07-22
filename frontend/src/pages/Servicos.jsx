import { useEffect, useState, useCallback } from 'react';
import { api, getUser } from '../lib/api';
import { brl } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

function tempoLegivel(min) {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function FormServico({ aberto, onFechar, onSalvo }) {
  const vazio = { nome: '', descricao: '', valor_padrao: '',
    tempo_estimado_min: '', intervalo_retorno_meses: '' };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setForm(vazio); setErro(''); }, [aberto]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const salvo = await api.criarServico({
        nome: form.nome,
        descricao: form.descricao || null,
        valor_padrao: Number(form.valor_padrao || 0),
        tempo_estimado_min: form.tempo_estimado_min ? Number(form.tempo_estimado_min) : null,
        intervalo_retorno_meses: form.intervalo_retorno_meses ? Number(form.intervalo_retorno_meses) : null,
      });
      onSalvo(salvo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Novo serviço" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')} required autoFocus
            placeholder="Troca de alternador" />
        </Campo>

        <Campo label="Descrição">
          <textarea className="input min-h-[70px] resize-y" value={form.descricao}
            onChange={set('descricao')} placeholder="Remoção, teste e instalação do alternador" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Valor padrão (R$)" obrigatorio>
            <input type="number" step="0.01" min="0" className="input tnum" required
              value={form.valor_padrao} onChange={set('valor_padrao')} placeholder="450.00" />
          </Campo>
          <Campo label="Tempo (min)">
            <input type="number" min="1" className="input" value={form.tempo_estimado_min}
              onChange={set('tempo_estimado_min')} placeholder="120" />
          </Campo>
          <Campo label="Retorno (meses)">
            <input type="number" min="1" max="120" className="input"
              value={form.intervalo_retorno_meses} onChange={set('intervalo_retorno_meses')}
              placeholder="6" />
          </Campo>
        </div>

        <p className="rounded-md bg-maninho-50 px-3 py-2 text-xs text-slate-600">
          <b>Retorno em meses:</b> se preenchido, o sistema cria automaticamente um
          lembrete quando este serviço for lançado numa OS finalizada — para chamar
          o cliente de volta no prazo. Deixe vazio para não gerar lembrete.
        </p>

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

/**
 * Card do serviço com edição inline dos 3 campos que mais mudam:
 * valor, tempo estimado, intervalo de retorno.
 */
function CardServico({ servico, ehAdmin, onSalvo }) {
  const [modo, setModo] = useState('ver');
  const [valor, setValor]   = useState(String(servico.valor_padrao ?? ''));
  const [tempo, setTempo]   = useState(String(servico.tempo_estimado_min ?? ''));
  const [ret, setRet]       = useState(String(servico.intervalo_retorno_meses ?? ''));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(''); setSalvando(true);
    try {
      const atualizado = await api.atualizarServico(servico.id, {
        valor_padrao: Number(valor || 0),
        tempo_estimado_min: tempo ? Number(tempo) : null,
        intervalo_retorno_meses: ret ? Number(ret) : null,
      });
      setModo('ver');
      onSalvo(atualizado);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  function cancelar() {
    setValor(String(servico.valor_padrao ?? ''));
    setTempo(String(servico.tempo_estimado_min ?? ''));
    setRet(String(servico.intervalo_retorno_meses ?? ''));
    setErro('');
    setModo('ver');
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold uppercase tracking-wide leading-snug text-maninho-800">
          {servico.nome}
        </h3>
        {ehAdmin && modo === 'ver' && (
          <button onClick={() => setModo('editar')}
            className="text-xs font-semibold text-maninho-600 hover:underline">
            editar
          </button>
        )}
      </div>
      {servico.descricao && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{servico.descricao}</p>
      )}

      {erro && <p className="mt-2 text-xs font-semibold text-rose-600">{erro}</p>}

      {modo === 'ver' ? (
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="label">Valor padrão</p>
            <p className="numero text-xl text-maninho-600">{brl(servico.valor_padrao)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
              {tempoLegivel(servico.tempo_estimado_min)}
            </span>
            {servico.intervalo_retorno_meses ? (
              <span className="rounded bg-ouro-100 px-2 py-1 text-[11px] font-semibold text-ouro-700">
                retorno · {servico.intervalo_retorno_meses} {servico.intervalo_retorno_meses === 1 ? 'mês' : 'meses'}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">sem retorno</span>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Valor
              <input type="number" step="0.01" min="0" className="input mt-0.5 py-1.5 text-sm tnum"
                value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Tempo (min)
              <input type="number" min="1" className="input mt-0.5 py-1.5 text-sm"
                value={tempo} onChange={(e) => setTempo(e.target.value)} />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Retorno (m)
              <input type="number" min="1" max="120" className="input mt-0.5 py-1.5 text-sm"
                value={ret} onChange={(e) => setRet(e.target.value)} placeholder="—" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={cancelar} className="btn-ghost px-3 py-1 text-xs" disabled={salvando}>
              Cancelar
            </button>
            <button onClick={salvar} className="btn-primary px-3 py-1 text-xs" disabled={salvando}>
              {salvando ? '…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Servicos() {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const usuario = getUser();
  const ehAdmin = usuario?.role === 'admin';

  const carregar = useCallback(() => {
    setErro('');
    api.servicos().then(setLista).catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrada = (lista || []).filter((s) =>
    !busca || s.nome.toLowerCase().includes(busca.toLowerCase())
    || (s.descricao || '').toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Catálogo de serviços</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {lista ? `${filtrada.length} de ${lista.length} serviços` : 'Carregando…'}
          </p>
        </div>
        {ehAdmin && (
          <button className="btn-primary" onClick={() => setAberto(true)}>+ Novo serviço</button>
        )}
      </div>

      <input className="input max-w-sm" placeholder="Buscar serviço…"
        value={busca} onChange={(e) => setBusca(e.target.value)} />

      {!ehAdmin && (
        <Alerta tipo="aviso">
          Somente administradores podem criar ou alterar serviços do catálogo.
        </Alerta>
      )}

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {!lista ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0,1,2,3,4,5].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : filtrada.length === 0 ? (
        <div className="card">
          <Vazio titulo={busca ? 'Nenhum serviço bate com a busca' : 'Catálogo vazio'}
            descricao={busca ? '' : 'Cadastre os serviços que a oficina executa.'} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtrada.map((s) => (
            <CardServico key={s.id} servico={s} ehAdmin={ehAdmin}
              onSalvo={(atualizado) => {
                setLista((l) => l.map((x) => (x.id === atualizado.id ? atualizado : x)));
              }} />
          ))}
        </div>
      )}

      <FormServico aberto={aberto} onFechar={() => setAberto(false)}
        onSalvo={() => { setAberto(false); carregar(); }} />
    </div>
  );
}
