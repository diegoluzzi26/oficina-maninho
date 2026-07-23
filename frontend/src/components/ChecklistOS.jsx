import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alerta, Skeleton, Spinner } from './ui';

/**
 * Checklist de inspeção visual — 4 seções fixas.
 * Cada item tem 3 botões de estado (OK/Atenção/Problema) e campo de
 * observação. Só editável se OS != paga.
 */

const SECOES = [
  { chave: 'internos',   titulo: 'Internos' },
  { chave: 'externos',   titulo: 'Externos' },
  { chave: 'motor',      titulo: 'Compartimento do Motor' },
  { chave: 'inferiores', titulo: 'Inferiores' },
];

const ESTADOS = [
  { chave: 'ok',       texto: '✓',  cor: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200', ativo: 'bg-emerald-600 text-white' },
  { chave: 'atencao',  texto: '!',  cor: 'bg-ouro-100 text-ouro-800 hover:bg-ouro-200',           ativo: 'bg-ouro-500 text-white' },
  { chave: 'problema', texto: '✗',  cor: 'bg-rose-100 text-rose-700 hover:bg-rose-200',           ativo: 'bg-rose-600 text-white' },
];

export function ChecklistOS({ os }) {
  const [checklist, setChecklist] = useState(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);

  const editavel = os && os.status !== 'paga';

  async function carregar() {
    setErro('');
    try {
      const cl = await api.checklistOS(os.id);
      setChecklist(cl);
    } catch (e) {
      if (e.status === 404) setChecklist(null);
      else setErro(e.message);
    }
  }
  useEffect(() => { if (os) carregar(); }, [os?.id]);

  async function iniciar() {
    setCriando(true); setErro('');
    try {
      const cl = await api.criarChecklistOS(os.id);
      setChecklist(cl);
    } catch (e) { setErro(e.message); }
    finally { setCriando(false); }
  }

  async function mudarEstado(item, novoEstado) {
    // Se clicar no mesmo estado, desmarca
    const alvo = item.estado === novoEstado ? null : novoEstado;
    // Update otimista
    setChecklist((c) => ({
      ...c,
      itens: c.itens.map((i) => (i.id === item.id ? { ...i, estado: alvo } : i)),
    }));
    try {
      await api.atualizarItemChecklist(os.id, item.id, { estado: alvo });
    } catch (e) { setErro(e.message); carregar(); }
  }

  async function mudarObs(item, texto) {
    setChecklist((c) => ({
      ...c,
      itens: c.itens.map((i) => (i.id === item.id ? { ...i, observacao: texto } : i)),
    }));
  }
  async function salvarObs(item) {
    try {
      await api.atualizarItemChecklist(os.id, item.id, { observacao: item.observacao || null });
    } catch (e) { setErro(e.message); }
  }

  async function salvarObsGeral(texto) {
    setChecklist((c) => ({ ...c, observacao_geral: texto }));
  }
  async function commitObsGeral(texto) {
    try {
      await api.atualizarObsChecklist(os.id, texto || null);
    } catch (e) { setErro(e.message); }
  }

  if (!os) return null;

  if (erro && !checklist) return <Alerta tipo="erro">{erro}</Alerta>;

  if (!checklist) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
        <p className="mb-2">Nenhum checklist iniciado para esta OS.</p>
        {editavel && (
          <button onClick={iniciar} className="btn-primary" disabled={criando}>
            {criando ? <><Spinner className="h-4 w-4" /> Iniciando…</> : 'Iniciar checklist'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {/* Cabeçalho — dados que vêm do papel */}
      <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">
        <p><b>Cliente:</b> {os.cliente_nome}</p>
        <p><b>Veículo:</b> {os.marca} {os.modelo} {os.ano ? `· ${os.ano}` : ''} · placa {os.placa}
          {os.km_entrada ? ` · ${Number(os.km_entrada).toLocaleString('pt-BR')} km` : ''}</p>
        <p><b>OS nº:</b> {os.numero_os}</p>
        {os.observacoes && (
          <p className="mt-1"><b>Observação do cliente:</b> {os.observacoes}</p>
        )}
      </div>

      {SECOES.map(({ chave, titulo }) => {
        const itens = checklist.itens.filter((i) => i.secao === chave);
        return (
          <div key={chave} className="rounded-md border border-slate-200">
            <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {titulo}
            </p>
            <ul className="divide-y divide-slate-100">
              {itens.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm text-slate-800">{it.nome}</span>
                  <div className="flex gap-1">
                    {ESTADOS.map((e) => (
                      <button key={e.chave}
                        disabled={!editavel}
                        onClick={() => mudarEstado(it, e.chave)}
                        title={e.chave}
                        className={`grid h-7 w-7 place-items-center rounded font-bold text-xs
                          ${it.estado === e.chave ? e.ativo : e.cor}
                          ${!editavel ? 'cursor-not-allowed opacity-70' : ''}`}>
                        {e.texto}
                      </button>
                    ))}
                  </div>
                  <input className="input w-full py-1 text-xs sm:w-64"
                    placeholder="observação"
                    disabled={!editavel}
                    value={it.observacao || ''}
                    onChange={(e) => mudarObs(it, e.target.value)}
                    onBlur={() => salvarObs(it)} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div>
        <p className="label mb-1">Observação geral</p>
        <textarea className="input min-h-[70px] resize-y"
          disabled={!editavel}
          value={checklist.observacao_geral || ''}
          onChange={(e) => salvarObsGeral(e.target.value)}
          onBlur={(e) => commitObsGeral(e.target.value)}
          placeholder="Conclusão da inspeção, recomendações…" />
      </div>

      {!editavel && (
        <p className="text-center text-xs text-slate-500">
          OS paga: checklist bloqueado para alteração.
        </p>
      )}
    </div>
  );
}
