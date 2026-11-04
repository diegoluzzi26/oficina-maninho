import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { brl, dataHora } from '../lib/format';
import { temPermissao } from '../lib/permissoes';
import { Alerta, Skeleton, Vazio } from '../components/ui';
import Paginacao from '../components/Paginacao';
import { ArquivosNota, ModalCancelarNota, StatusNota, TIPO_NOTA } from '../components/NotasFiscais';

/**
 * Aba Notas Fiscais: todas as notas emitidas pelas OS da oficina, com filtro
 * por tipo, status, período e busca (cliente, nº da nota, nº da OS).
 * Página e filtros ficam na URL, como nas outras listas.
 * Emitir é na própria OS; aqui dá pra baixar PDF/XML e cancelar.
 */
export default function NotasFiscais() {
  const [sp, setSp] = useSearchParams();
  const filtros = {
    tipo: sp.get('tipo') || '',
    status: sp.get('status') || '',
    de: sp.get('de') || '',
    ate: sp.get('ate') || '',
    busca: sp.get('busca') || '',
  };
  const pagina = Number(sp.get('pagina')) || 1;
  const porPagina = Math.min(100, Math.max(1, Number(sp.get('por_pagina')) || 20));

  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [semAdicional, setSemAdicional] = useState(false);
  const [busca, setBusca] = useState(filtros.busca);
  const [cancelando, setCancelando] = useState(null);
  const podeCancelar = temPermissao('fiscal');

  /** Mescla na URL; valores vazios/padrão somem. Trocar filtro volta pra página 1. */
  const patchSp = useCallback((patch, { resetPagina = true } = {}) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      const merged = { ...patch };
      if (resetPagina && !('pagina' in patch)) merged.pagina = 1;
      for (const [k, v] of Object.entries(merged)) {
        const padrao = (k === 'pagina' && Number(v) === 1) || (k === 'por_pagina' && Number(v) === 20);
        if (v === '' || v == null || padrao) next.delete(k); else next.set(k, String(v));
      }
      return next;
    }, { replace: true });
  }, [setSp]);

  const chave = sp.toString();
  useEffect(() => {
    let cancelado = false;
    setErro('');
    api.notasFiscais({ ...filtros, pagina, por_pagina: porPagina })
      .then((r) => { if (!cancelado) setLista(r); })
      .catch((e) => {
        if (cancelado) return;
        if (e.status === 403 && e.detalhes?.adicional) setSemAdicional(true); else setErro(e.message);
      });
    return () => { cancelado = true; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca com pequeno atraso pra não consultar a cada tecla.
  useEffect(() => {
    if (busca === filtros.busca) return undefined;
    const t = setTimeout(() => patchSp({ busca }), 400);
    return () => clearTimeout(t);
  }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => patchSp({ [k]: e.target.value });

  if (semAdicional) {
    return (
      <div className="card p-6">
        <h1 className="titulo-secao">Notas fiscais</h1>
        <p className="text-sm text-slate-600">
          Emita NFS-e (mão de obra) e NF-e (peças) direto da ordem de serviço. É um adicional de R$ 39/mês,
          disponível nos planos Profissional e Completo. Para contratar, fale com o suporte.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
          Notas fiscais
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Notas emitidas pelas OS. Para emitir, abra a OS finalizada e use o bloco Nota fiscal.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <input className="input max-w-xs" placeholder="Cliente, nº da nota ou nº da OS"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="input w-auto" value={filtros.tipo} onChange={set('tipo')} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          <option value="nfse">NFS-e (mão de obra)</option>
          <option value="nfe">NF-e (peças)</option>
        </select>
        <select className="input w-auto" value={filtros.status} onChange={set('status')} aria-label="Situação">
          <option value="">Todas as situações</option>
          <option value="autorizada">Autorizadas</option>
          <option value="processando">Processando</option>
          <option value="erro">Com erro</option>
          <option value="cancelada">Canceladas</option>
        </select>
        <label className="text-xs text-slate-500">De
          <input type="date" className="input mt-1 w-auto" value={filtros.de} onChange={set('de')} />
        </label>
        <label className="text-xs text-slate-500">Até
          <input type="date" className="input mt-1 w-auto" value={filtros.ate} onChange={set('ate')} />
        </label>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      <div className="card overflow-hidden">
        {lista === null ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : lista.dados.length === 0 ? (
          <Vazio titulo="Nenhuma nota encontrada"
            descricao={chave ? 'Mude os filtros para ver outras notas.' : 'As notas emitidas nas OS aparecem aqui.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/70 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Emissão</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Nº</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">OS</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                    <th className="px-4 py-2">Situação</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lista.dados.map((n) => (
                    <tr key={n.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-600">{dataHora(n.criado_em)}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-semibold text-slate-800">{TIPO_NOTA[n.tipo]}</span>
                        {n.ambiente === 'homologacao' && (
                          <span className="ml-1 rounded bg-ouro-100 px-1 py-0.5 text-[10px] font-semibold text-ouro-700">teste</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 tnum">{n.numero || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-700">{n.cliente_nome}</td>
                      <td className="px-4 py-2.5">
                        <Link to={`/ordens?os=${n.os_id}`} className="font-semibold text-maninho-600 hover:underline">
                          #{n.numero_os}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right tnum font-semibold text-slate-800">{brl(n.valor)}</td>
                      <td className="max-w-xs px-4 py-2.5">
                        <StatusNota status={n.status} />
                        {n.status === 'erro' && n.mensagem_erro && (
                          <p className="mt-1 text-[11px] text-rose-700">{n.mensagem_erro}</p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-3">
                          <ArquivosNota nota={n} />
                          {podeCancelar && n.status === 'autorizada' && (
                            <button type="button" onClick={() => setCancelando(n)}
                              className="text-xs font-semibold text-rose-600 hover:underline">Cancelar</button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacao
              paginacao={lista.paginacao}
              onPagina={(p) => patchSp({ pagina: p }, { resetPagina: false })}
              onPorPagina={(p) => patchSp({ por_pagina: p })}
              resumo={(
                <span className="tnum text-sm">
                  <span className="text-slate-500">Autorizadas no filtro </span>
                  <span className="font-display text-base font-bold text-maninho-700">
                    {brl(lista.paginacao.total_valor)}
                  </span>
                </span>
              )}
            />
          </>
        )}
      </div>

      {cancelando && (
        <ModalCancelarNota nota={cancelando} onFechar={() => setCancelando(null)}
          onCancelada={(c) => {
            // A cancelada sai do total de autorizadas do rodapé.
            setLista((l) => ({
              dados: l.dados.map((x) => (x.id === c.id ? { ...x, ...c } : x)),
              paginacao: { ...l.paginacao, total_valor: Math.max(0, l.paginacao.total_valor - cancelando.valor) },
            }));
            setCancelando(null);
          }} />
      )}
    </div>
  );
}
