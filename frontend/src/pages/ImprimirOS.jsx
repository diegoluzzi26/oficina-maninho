import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { brl, data, dataHora, telefone, rotuloForma } from '../lib/format';

/**
 * View "papel" da OS.
 *
 * Fica FORA do Layout do app (sem menu, sem cabeçalho colorido) porque
 * os estilos são pensados pra caber numa A4 e ir pra impressora ou PDF.
 * O botão "Imprimir" abre `#/os/{id}/imprimir` em nova aba, o usuário
 * revisa e usa o Ctrl+P (ou clica no botão desta tela) — o browser gera
 * PDF nativo sem depender de lib no servidor.
 *
 * Duas variantes na mesma tela, decididas pelo `status`:
 *  - OS não paga  → mostra linha "assinatura do cliente" (check-in)
 *  - OS paga      → mostra bloco RECIBO com forma/data/valor
 */
export default function ImprimirOS() {
  const { id } = useParams();
  const [os, setOS] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.ordem(id).then(setOS).catch((e) => setErro(e.message));
  }, [id]);

  if (erro) return <div className="p-10 text-rose-700">Erro: {erro}</div>;
  if (!os)  return <div className="p-10 text-slate-500">Carregando…</div>;

  const ehPaga = os.status === 'paga';
  const itens = [
    ...os.servicos.map((s) => ({ tipo: 'Serviço', descricao: s.nome_servico,
      qtd: s.quantidade, unit: s.valor_unit, total: s.valor_total })),
    ...os.pecas.map((p) => ({ tipo: 'Peça', descricao: p.descricao,
      qtd: p.quantidade, unit: p.valor_unit, total: p.valor_total })),
  ];

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-slate-800 print:p-6">
      {/* Cabeçalho da oficina */}
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

      {/* Título + número */}
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {ehPaga ? 'Recibo de pagamento' : 'Ordem de serviço'}
          </p>
          <h1 className="tnum font-display text-3xl font-bold text-slate-900">
            Nº {os.numero_os}
          </h1>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Aberta em <b className="text-slate-700">{dataHora(os.aberta_em)}</b></p>
          {os.criado_por_nome && <p>por {os.criado_por_nome}</p>}
        </div>
      </div>

      {/* Cliente e veículo */}
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
          <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-500">Observações</p>
          <p className="text-slate-700">{os.observacoes}</p>
        </div>
      )}

      {/* Itens */}
      <table className="mb-4 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left text-[10px] uppercase tracking-wide text-slate-600">
            <th className="w-16 py-2">Tipo</th>
            <th className="py-2">Descrição</th>
            <th className="w-16 py-2 text-right">Qtd</th>
            <th className="w-24 py-2 text-right">Unit.</th>
            <th className="w-28 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.length === 0 ? (
            <tr><td colSpan={5} className="py-3 text-center italic text-slate-400">
              Nenhum item lançado
            </td></tr>
          ) : itens.map((it, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2 text-xs uppercase text-slate-500">{it.tipo}</td>
              <td className="py-2">{it.descricao}</td>
              <td className="tnum py-2 text-right">{Number(it.qtd)}</td>
              <td className="tnum py-2 text-right">{brl(it.unit)}</td>
              <td className="tnum py-2 text-right font-semibold">{brl(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totais */}
      <div className="ml-auto max-w-[240px] space-y-1 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Serviços</span><span className="tnum">{brl(os.valor_servicos)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Peças</span><span className="tnum">{brl(os.valor_pecas)}</span>
        </div>
        {Number(os.desconto) > 0 && (
          <div className="flex justify-between text-rose-700">
            <span>Desconto</span><span className="tnum">− {brl(os.desconto)}</span>
          </div>
        )}
        <div className="flex justify-between border-t-2 border-slate-800 pt-1.5 text-base font-bold">
          <span>Total</span><span className="tnum">{brl(os.valor_total)}</span>
        </div>
      </div>

      {/* Bloco RECIBO ou assinatura */}
      {ehPaga ? (
        <div className="mt-8 rounded border-2 border-emerald-600 bg-emerald-50 p-4">
          <p className="mb-2 text-center font-display text-sm font-bold uppercase tracking-wider text-emerald-800">
            Recibo
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[10px] uppercase text-slate-500">Data do pagamento</p>
              <p className="font-semibold">{data(os.paga_em)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">Forma</p>
              <p className="font-semibold">{rotuloForma(os.forma_pagamento)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-slate-500">Valor pago</p>
              <p className="font-semibold">{brl(os.valor_pago || os.valor_total)}</p>
            </div>
          </div>
          {Number(os.valor_pago) < Number(os.valor_total) && (
            <p className="mt-2 text-center text-xs text-rose-700">
              Pagamento parcial. Saldo em aberto: {brl(os.valor_total - os.valor_pago)}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-16 grid grid-cols-2 gap-12 text-sm">
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
      )}

      <footer className="mt-10 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
        Documento gerado pelo sistema em {new Date().toLocaleString('pt-BR')}
      </footer>

      {/* Barra flutuante (não vai pro papel) */}
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
