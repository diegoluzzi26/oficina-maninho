import { useEffect, useState, useCallback } from 'react';
import { api, getUser } from '../lib/api';
import { brl } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

/**
 * Catálogo (serviços + peças) numa mesma página, alternada por aba.
 * Formato de LISTA compacta em vez de cards — cada linha ocupa pouca
 * altura, edição inline dos campos que mais mudam (valor, tempo,
 * intervalo de retorno) e botão de excluir (que desativa, mantendo o
 * histórico das OS antigas intacto).
 */

function tempoLegivel(min) {
  if (!min) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// ------------------ Modal: Novo serviço ------------------
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
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
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
          <textarea className="input min-h-[60px] resize-y" value={form.descricao}
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

// ------------------ Linha de serviço ------------------
function LinhaServico({ servico, ehAdmin, onSalvo, onExcluido }) {
  const [modo, setModo] = useState('ver');
  const [valor, setValor] = useState(String(servico.valor_padrao ?? ''));
  const [tempo, setTempo] = useState(String(servico.tempo_estimado_min ?? ''));
  const [ret, setRet]     = useState(String(servico.intervalo_retorno_meses ?? ''));
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
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  function cancelar() {
    setValor(String(servico.valor_padrao ?? ''));
    setTempo(String(servico.tempo_estimado_min ?? ''));
    setRet(String(servico.intervalo_retorno_meses ?? ''));
    setErro(''); setModo('ver');
  }

  async function excluir() {
    if (!confirm(`Excluir o serviço "${servico.nome}"? OS antigas continuam com o nome/valor congelado, mas ele some do catálogo.`)) return;
    setErro('');
    try {
      await api.desativarServico(servico.id);
      onExcluido(servico.id);
    } catch (e) { setErro(e.message); }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 hover:bg-slate-50/60">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{servico.nome}</p>
        {servico.descricao && (
          <p className="truncate text-[11px] text-slate-500">{servico.descricao}</p>
        )}
        {erro && <p className="text-[11px] font-semibold text-rose-600">{erro}</p>}
      </div>

      {modo === 'ver' ? (
        <>
          <div className="w-24 text-right">
            <p className="tnum font-semibold text-maninho-700">{brl(servico.valor_padrao)}</p>
          </div>
          <div className="hidden w-20 text-right sm:block">
            <p className="text-xs text-slate-500">{tempoLegivel(servico.tempo_estimado_min)}</p>
          </div>
          <div className="hidden w-24 text-right sm:block">
            {servico.intervalo_retorno_meses ? (
              <span className="rounded bg-ouro-100 px-1.5 py-0.5 text-[10px] font-semibold text-ouro-700">
                {servico.intervalo_retorno_meses}m retorno
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">—</span>
            )}
          </div>
          {ehAdmin && (
            <div className="flex gap-1">
              <button onClick={() => setModo('editar')}
                className="rounded px-2 py-1 text-[11px] font-semibold text-maninho-600 hover:bg-maninho-50">
                Editar
              </button>
              <button onClick={excluir}
                className="rounded px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">
                Excluir
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" step="0.01" min="0" placeholder="Valor"
            className="input w-24 py-1 text-xs tnum"
            value={valor} onChange={(e) => setValor(e.target.value)} />
          <input type="number" min="1" placeholder="Tempo"
            className="input w-20 py-1 text-xs"
            value={tempo} onChange={(e) => setTempo(e.target.value)} />
          <input type="number" min="1" max="120" placeholder="Ret m"
            className="input w-20 py-1 text-xs"
            value={ret} onChange={(e) => setRet(e.target.value)} />
          <button onClick={salvar} disabled={salvando}
            className="btn-primary px-2 py-1 text-xs">
            {salvando ? '…' : 'Salvar'}
          </button>
          <button onClick={cancelar} disabled={salvando}
            className="btn-ghost px-2 py-1 text-xs">
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}

// ------------------ Linha de peça ------------------
function LinhaPeca({ peca, ehAdmin, onSalvo, onExcluido }) {
  const [modo, setModo] = useState('ver');
  const [nome, setNome] = useState(peca.nome);
  const [valor, setValor] = useState(String(peca.valor_padrao ?? ''));
  const [ret, setRet]   = useState(String(peca.intervalo_retorno_meses ?? ''));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(''); setSalvando(true);
    try {
      const atualizado = await api.atualizarPeca(peca.id, {
        nome: nome.trim(),
        valor_padrao: Number(valor || 0),
        intervalo_retorno_meses: ret ? Number(ret) : null,
      });
      setModo('ver');
      onSalvo(atualizado);
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  function cancelar() {
    setNome(peca.nome);
    setValor(String(peca.valor_padrao ?? ''));
    setRet(String(peca.intervalo_retorno_meses ?? ''));
    setErro(''); setModo('ver');
  }

  async function excluir() {
    if (!confirm(`Excluir a peça "${peca.nome}"?`)) return;
    setErro('');
    try {
      await api.desativarPeca(peca.id);
      onExcluido(peca.id);
    } catch (e) { setErro(e.message); }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-2.5 hover:bg-slate-50/60">
      <div className="min-w-0 flex-1">
        {modo === 'ver' ? (
          <p className="truncate text-sm font-semibold text-slate-800">{peca.nome}</p>
        ) : (
          <input className="input py-1 text-sm" value={nome}
            onChange={(e) => setNome(e.target.value)} />
        )}
        {erro && <p className="text-[11px] font-semibold text-rose-600">{erro}</p>}
      </div>

      {modo === 'ver' ? (
        <>
          <div className="w-24 text-right">
            <p className="tnum font-semibold text-maninho-700">{brl(peca.valor_padrao)}</p>
          </div>
          <div className="hidden w-24 text-right sm:block">
            {peca.intervalo_retorno_meses ? (
              <span className="rounded bg-ouro-100 px-1.5 py-0.5 text-[10px] font-semibold text-ouro-700">
                {peca.intervalo_retorno_meses}m retorno
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">—</span>
            )}
          </div>
          {ehAdmin && (
            <div className="flex gap-1">
              <button onClick={() => setModo('editar')}
                className="rounded px-2 py-1 text-[11px] font-semibold text-maninho-600 hover:bg-maninho-50">
                Editar
              </button>
              <button onClick={excluir}
                className="rounded px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">
                Excluir
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2">
          <input type="number" step="0.01" min="0" placeholder="Valor"
            className="input w-24 py-1 text-xs tnum"
            value={valor} onChange={(e) => setValor(e.target.value)} />
          <input type="number" min="1" max="120" placeholder="Ret m"
            className="input w-20 py-1 text-xs"
            value={ret} onChange={(e) => setRet(e.target.value)} />
          <button onClick={salvar} disabled={salvando}
            className="btn-primary px-2 py-1 text-xs">
            {salvando ? '…' : 'Salvar'}
          </button>
          <button onClick={cancelar} disabled={salvando}
            className="btn-ghost px-2 py-1 text-xs">
            Cancelar
          </button>
        </div>
      )}
    </li>
  );
}

// ------------------ Página ------------------
export default function Servicos() {
  const [aba, setAba] = useState('servicos'); // 'servicos' | 'pecas'
  const [servicos, setServicos] = useState(null);
  const [pecas, setPecas] = useState(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);

  const usuario = getUser();
  const ehAdmin = usuario?.role === 'admin';

  const carregar = useCallback(() => {
    setErro('');
    Promise.all([api.servicos(), api.pecas()])
      .then(([s, p]) => { setServicos(s); setPecas(p); })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const lista = aba === 'servicos' ? servicos : pecas;
  const filtrada = (lista || []).filter((x) =>
    !busca
    || (x.nome || '').toLowerCase().includes(busca.toLowerCase())
    || (x.descricao || '').toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Catálogo</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {lista ? `${filtrada.length} ${aba === 'servicos' ? 'serviços' : 'peças'} de ${lista.length}` : 'Carregando…'}
          </p>
        </div>
        {ehAdmin && aba === 'servicos' && (
          <button className="btn-primary" onClick={() => setAberto(true)}>
            + Novo serviço
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
          {[['servicos', 'Serviços', servicos?.length], ['pecas', 'Peças', pecas?.length]].map(([k, t, qtd]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`rounded px-3.5 py-1.5 text-xs font-semibold transition
                ${aba === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {t} {qtd !== undefined && (
                <span className={`ml-1 tnum text-[10px]
                  ${aba === k ? 'text-white/80' : 'text-slate-400'}`}>
                  {qtd}
                </span>
              )}
            </button>
          ))}
        </div>
        <input className="input max-w-sm" placeholder={`Buscar ${aba === 'servicos' ? 'serviço' : 'peça'}…`}
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {!ehAdmin && (
        <Alerta tipo="aviso">
          Somente administradores podem criar, editar ou excluir itens do catálogo.
        </Alerta>
      )}

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {lista === null ? (
        <div className="card">
          <ul className="divide-y divide-slate-100">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="p-3"><Skeleton className="h-6" /></li>
            ))}
          </ul>
        </div>
      ) : filtrada.length === 0 ? (
        <div className="card">
          <Vazio titulo={busca ? 'Nada bate com a busca'
            : aba === 'servicos' ? 'Catálogo de serviços vazio'
            : 'Nenhuma peça no catálogo ainda'}
            descricao={busca ? '' : (aba === 'pecas'
              ? 'Peças aparecem aqui automaticamente conforme você lança nas OS.'
              : '')} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Cabeçalho da lista */}
          <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex-1">Nome</span>
              <span className="w-24 text-right">Valor</span>
              {aba === 'servicos' && (
                <>
                  <span className="hidden w-20 text-right sm:inline">Tempo</span>
                  <span className="hidden w-24 text-right sm:inline">Retorno</span>
                </>
              )}
              {aba === 'pecas' && (
                <span className="hidden w-24 text-right sm:inline">Retorno</span>
              )}
              {ehAdmin && <span className="w-[110px]">&nbsp;</span>}
            </div>
          </div>
          <ul className="divide-y-0">
            {filtrada.map((item) => aba === 'servicos' ? (
              <LinhaServico key={item.id} servico={item} ehAdmin={ehAdmin}
                onSalvo={(a) => setServicos((l) => l.map((x) => x.id === a.id ? a : x))}
                onExcluido={(id) => setServicos((l) => l.filter((x) => x.id !== id))} />
            ) : (
              <LinhaPeca key={item.id} peca={item} ehAdmin={ehAdmin}
                onSalvo={(a) => setPecas((l) => l.map((x) => x.id === a.id ? a : x))}
                onExcluido={(id) => setPecas((l) => l.filter((x) => x.id !== id))} />
            ))}
          </ul>
        </div>
      )}

      <FormServico aberto={aberto} onFechar={() => setAberto(false)}
        onSalvo={() => { setAberto(false); carregar(); }} />
    </div>
  );
}
