import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, FileCode, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { brl } from '../lib/format';
import { Alerta, Campo, Modal, Spinner } from './ui';

/**
 * Peças compartilhadas da nota fiscal: selo de status, links de PDF/XML,
 * modal de cancelamento e o bloco "Nota fiscal" dentro da OS.
 */

export const TIPO_NOTA = { nfse: 'NFS-e', nfe: 'NF-e' };
const TIPO_DESC = { nfse: 'Mão de obra', nfe: 'Peças' };

const STATUS = {
  processando: { texto: 'Processando', cor: 'bg-sky-100 text-sky-800' },
  autorizada: { texto: 'Autorizada', cor: 'bg-emerald-100 text-emerald-800' },
  erro: { texto: 'Com erro', cor: 'bg-rose-100 text-rose-800' },
  cancelada: { texto: 'Cancelada', cor: 'bg-slate-200 text-slate-700' },
};

export function StatusNota({ status }) {
  const s = STATUS[status] || { texto: status, cor: 'bg-slate-100 text-slate-600' };
  return <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${s.cor}`}>{s.texto}</span>;
}

export function ArquivosNota({ nota }) {
  if (nota.status !== 'autorizada' && nota.status !== 'cancelada') return null;
  return (
    <span className="inline-flex gap-2">
      {nota.url_pdf && (
        <a href={nota.url_pdf} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-maninho-600 hover:underline">
          <FileText size={14} aria-hidden="true" /> PDF
        </a>
      )}
      {nota.url_xml && (
        <a href={nota.url_xml} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-maninho-600 hover:underline">
          <FileCode size={14} aria-hidden="true" /> XML
        </a>
      )}
    </span>
  );
}

/** Cancelar nota autorizada: a SEFAZ/prefeitura pede justificativa de 15 a 255 caracteres. */
export function ModalCancelarNota({ nota, onFechar, onCancelada }) {
  const [justificativa, setJustificativa] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const curta = justificativa.trim().length < 15;

  async function cancelar(e) {
    e.preventDefault();
    setErro(''); setEnviando(true);
    try { onCancelada(await api.cancelarNota(nota.id, justificativa.trim())); }
    catch (err) { setErro(err.message); }
    finally { setEnviando(false); }
  }

  return (
    <Modal aberto largura="max-w-md" titulo={`Cancelar ${TIPO_NOTA[nota.tipo]} nº ${nota.numero || ''}`} onFechar={onFechar}>
      <form onSubmit={cancelar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        <p className="text-sm text-slate-600">
          O cancelamento vai para a {nota.tipo === 'nfe' ? 'SEFAZ' : 'prefeitura'} e não dá para desfazer.
          {nota.tipo === 'nfe' && ' A NF-e costuma poder ser cancelada só nas primeiras 24 horas.'}
        </p>
        <Campo label="Motivo do cancelamento" obrigatorio ajuda="De 15 a 255 caracteres">
          <textarea className="input min-h-[80px]" value={justificativa} maxLength={255}
            onChange={(e) => setJustificativa(e.target.value)} placeholder="Ex.: valor das peças lançado errado" />
        </Campo>
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Voltar</button>
          <button type="submit" className="btn-primary bg-rose-600 hover:bg-rose-700" disabled={curta || enviando}>
            {enviando ? <><Spinner className="h-4 w-4" /> Cancelando…</> : 'Cancelar nota'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Uma linha de nota no bloco da OS. */
function LinhaNota({ nota, podeEmitir, onAtualizada, onCancelar }) {
  const [atualizando, setAtualizando] = useState(false);
  async function atualizar() {
    setAtualizando(true);
    try { onAtualizada(await api.atualizarNota(nota.id)); } catch { /* segue mostrando o que tem */ }
    finally { setAtualizando(false); }
  }
  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-800">{TIPO_NOTA[nota.tipo]}</span>
        <StatusNota status={nota.status} />
        {nota.numero && <span className="text-xs text-slate-500">nº {nota.numero}</span>}
        <span className="tnum text-xs text-slate-500">{brl(nota.valor)}</span>
        {nota.ambiente === 'homologacao' && (
          <span className="rounded bg-ouro-100 px-1.5 py-0.5 text-[10px] font-semibold text-ouro-700">teste</span>
        )}
        <span className="flex-1" />
        <ArquivosNota nota={nota} />
        {nota.status === 'processando' && (
          <button type="button" onClick={atualizar} disabled={atualizando}
            className="inline-flex items-center gap-1 text-xs font-semibold text-maninho-600 hover:underline">
            <RefreshCw size={13} className={atualizando ? 'animate-spin' : ''} aria-hidden="true" /> Atualizar
          </button>
        )}
        {podeEmitir && nota.status === 'autorizada' && (
          <button type="button" onClick={() => onCancelar(nota)}
            className="text-xs font-semibold text-rose-600 hover:underline">Cancelar</button>
        )}
      </div>
      {nota.status === 'erro' && nota.mensagem_erro && (
        <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-800">{nota.mensagem_erro}</p>
      )}
      {nota.status === 'processando' && nota.mensagem_erro && (
        <p className="text-xs text-slate-500">{nota.mensagem_erro}</p>
      )}
    </li>
  );
}

/**
 * Bloco "Nota fiscal" na OS: notas já emitidas e os botões de emitir.
 * Some quando a oficina não tem o adicional (a API responde 403).
 * Enquanto houver nota processando, reconsulta a cada 10 s.
 */
export function NotasDaOS({ os, podeEmitir }) {
  const [notas, setNotas] = useState(null);
  const [semAdicional, setSemAdicional] = useState(false);
  const [emitindo, setEmitindo] = useState(null);
  const [erro, setErro] = useState('');
  const [cancelando, setCancelando] = useState(null);
  const [situacao, setSituacao] = useState(null);
  const timer = useRef(null);

  useEffect(() => { api.notasSituacao().then(setSituacao).catch(() => {}); }, []);

  const carregar = useCallback(() => {
    api.notasDaOS(os.id).then(setNotas).catch((e) => {
      if (e.status === 403) setSemAdicional(true); else setErro(e.message);
    });
  }, [os.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const processando = notas?.some((n) => n.status === 'processando');
  useEffect(() => {
    if (!processando) return undefined;
    timer.current = setInterval(carregar, 10000);
    return () => clearInterval(timer.current);
  }, [processando, carregar]);

  if (semAdicional) return null;

  const fechada = ['finalizada', 'paga'].includes(os.status);
  const viva = (tipo) => notas?.some((n) => n.tipo === tipo && ['processando', 'autorizada'].includes(n.status));
  const temItens = { nfse: os.servicos?.length > 0, nfe: os.pecas?.length > 0 };
  const substituir = (n) => setNotas((l) => l.map((x) => (x.id === n.id ? n : x)));

  async function emitir(tipo) {
    // Nota que vale de verdade (produção, ou NFS-e pela prefeitura, que não
    // tem ambiente de teste): confirma antes.
    const valendo = tipo === 'nfse' ? situacao?.nfse_valendo : situacao?.nfe_valendo;
    if (valendo && !window.confirm(
      `Esta ${TIPO_NOTA[tipo]} vai valer de verdade (com validade fiscal). Conferiu cliente e valores? Emitir agora?`,
    )) return;
    setErro(''); setEmitindo(tipo);
    try {
      const n = await api.emitirNota(os.id, tipo);
      setNotas((l) => [n, ...(l || [])]);
    } catch (err) { setErro(err.message); }
    finally { setEmitindo(null); }
  }

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nota fiscal</p>
        <span className="flex-1" />
        {podeEmitir && ['nfse', 'nfe'].map((tipo) => temItens[tipo] && !viva(tipo) && (
          <button key={tipo} type="button" className="btn-ghost px-2.5 py-1 text-xs"
            disabled={!fechada || emitindo !== null}
            title={fechada ? `${TIPO_DESC[tipo]} da OS` : 'Finalize a OS para emitir'}
            onClick={() => emitir(tipo)}>
            {emitindo === tipo ? <Spinner className="h-3.5 w-3.5" /> : null}
            Emitir {TIPO_NOTA[tipo]}
          </button>
        ))}
      </div>
      {erro && <div className="mt-2"><Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta></div>}
      {notas === null
        ? <p className="py-2 text-xs text-slate-400">Carregando…</p>
        : notas.length === 0
          ? <p className="py-2 text-xs text-slate-400">
            {fechada ? 'Nenhuma nota emitida para esta OS.' : 'Finalize a OS para emitir a nota fiscal.'}
          </p>
          : (
            <ul className="divide-y divide-slate-100">
              {notas.map((n) => (
                <LinhaNota key={n.id} nota={n} podeEmitir={podeEmitir}
                  onAtualizada={substituir} onCancelar={setCancelando} />
              ))}
            </ul>
          )}
      {cancelando && (
        <ModalCancelarNota nota={cancelando} onFechar={() => setCancelando(null)}
          onCancelada={(n) => { substituir(n); setCancelando(null); }} />
      )}
    </div>
  );
}
