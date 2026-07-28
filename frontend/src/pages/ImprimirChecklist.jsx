import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { dataHora, telefone } from '../lib/format';

const SECOES = [
  { chave: 'internos',   titulo: 'Internos' },
  { chave: 'externos',   titulo: 'Externos' },
  { chave: 'motor',      titulo: 'Compartimento do Motor' },
  { chave: 'inferiores', titulo: 'Inferiores' },
];

const ROTULO_ESTADO = {
  ok:       { texto: 'OK',       classe: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  atencao:  { texto: 'Atenção',  classe: 'bg-ouro-100 text-ouro-800 ring-ouro-300' },
  problema: { texto: 'Problema', classe: 'bg-rose-100 text-rose-800 ring-rose-300' },
};

export default function ImprimirChecklist() {
  const { id } = useParams();
  const [os, setOS] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    Promise.all([api.ordem(id), api.checklistOS(id).catch((e) => {
      if (e.status === 404) return null;
      throw e;
    })])
      .then(([o, cl]) => { setOS(o); setChecklist(cl); })
      .catch((e) => setErro(e.message));
  }, [id]);

  if (erro) return <div className="p-10 text-rose-700">Erro: {erro}</div>;
  if (!os)  return <div className="p-10 text-slate-500">Carregando…</div>;

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-slate-800 print:p-6">
      <header className="mb-6 flex items-center justify-between gap-6 border-b border-slate-300 pb-4">
        <img src="/logo-maninho.svg" alt="Auto Elétrica Maninho"
          className="h-14 w-auto" />
        <div className="text-right text-xs leading-snug text-slate-600">
          <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-slate-800">
            Auto Elétrica Maninho
          </p>
          <p>RS-020, 1055 · Gravataí/RS</p>
          <p>Elétrica · Injeção · Ar-condicionado</p>
        </div>
      </header>

      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Checklist de inspeção
          </p>
          <h1 className="tnum font-display text-3xl font-bold text-slate-900">
            OS Nº {os.numero_os}
          </h1>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Aberta em <b className="text-slate-700">{dataHora(os.aberta_em)}</b></p>
          {os.criado_por_nome && <p>por {os.criado_por_nome}</p>}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-6 rounded border border-slate-200 p-4">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Cliente
          </p>
          <p className="text-sm font-semibold">{os.cliente_nome}</p>
          <p className="text-xs text-slate-600">Cliente nº {os.numero_cliente}</p>
          <p className="text-xs text-slate-600">{telefone(os.cliente_telefone)}</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Veículo
          </p>
          <p className="text-sm font-semibold">
            {os.marca} {os.modelo} {os.ano ? `· ${os.ano}` : ''}
          </p>
          <p className="font-mono text-xs text-slate-600">Placa {os.placa}</p>
          {os.km_entrada && (
            <p className="text-xs text-slate-600">
              KM na entrada: {Number(os.km_entrada).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      </div>

      {os.observacoes && (
        <div className="mb-5 rounded border-l-2 border-slate-400 bg-slate-50 p-3 text-sm">
          <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-500">Observação do cliente</p>
          <p className="text-slate-700">{os.observacoes}</p>
        </div>
      )}

      {!checklist ? (
        <div className="my-8 rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhum checklist iniciado para esta OS.
        </div>
      ) : (
        <>
          {SECOES.map(({ chave, titulo }) => {
            const itens = checklist.itens.filter((i) => i.secao === chave);
            if (itens.length === 0) return null;
            return (
              <div key={chave} className="mb-4 break-inside-avoid">
                <p className="mb-1 border-b-2 border-slate-800 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  {titulo}
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {itens.map((it) => {
                      const est = it.estado ? ROTULO_ESTADO[it.estado] : null;
                      return (
                        <tr key={it.id} className="border-b border-slate-100">
                          <td className="w-8 py-1.5 text-center">
                            <span className="inline-grid h-4 w-4 place-items-center rounded-sm border border-slate-400 text-[10px]">
                              {est ? '✓' : ''}
                            </span>
                          </td>
                          <td className="py-1.5">{it.nome}</td>
                          <td className="w-24 py-1.5 text-right">
                            {est ? (
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${est.classe}`}>
                                {est.texto}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
                          </td>
                          <td className="w-64 py-1.5 pl-2 text-xs text-slate-600">
                            {it.observacao || ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="mt-6 break-inside-avoid">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Observação geral
            </p>
            <div className="min-h-[70px] whitespace-pre-wrap rounded border border-slate-300 p-3 text-sm text-slate-700">
              {checklist.observacao_geral || <span className="text-slate-400">—</span>}
            </div>
          </div>
        </>
      )}

      <div className="mt-12 grid grid-cols-2 gap-12 text-sm break-inside-avoid">
        <div className="text-center">
          <div className="mb-1 border-b border-slate-400 pb-8">&nbsp;</div>
          <p className="text-xs text-slate-500">Assinatura do cliente</p>
          <p className="text-[10px] text-slate-400">{os.cliente_nome}</p>
        </div>
        <div className="text-center">
          <div className="mb-1 border-b border-slate-400 pb-8">&nbsp;</div>
          <p className="text-xs text-slate-500">Assinatura da oficina</p>
        </div>
      </div>

      <footer className="mt-10 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
        Documento gerado pelo sistema em {new Date().toLocaleString('pt-BR')}
      </footer>

      <div className="fixed bottom-4 right-4 flex gap-2 print:hidden">
        <button onClick={() => window.print()}
          className="rounded-md bg-maninho-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-maninho-700">
          🖨 Imprimir / salvar em PDF
        </button>
        <button onClick={() => window.close()}
          className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 shadow hover:bg-slate-200">
          Fechar
        </button>
      </div>
    </div>
  );
}
