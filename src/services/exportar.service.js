'use strict';
const ExcelJS = require('exceljs');
const relatorios = require('./relatorios.service');
const financeiro = require('./financeiro.service');
const despesas = require('./despesas.service');

/**
 * Gera um Excel (.xlsx) com o resumo do mês da oficina.
 * 3 abas:
 *   1. Resumo — KPIs do mês (receita, despesa, lucro, ticket etc)
 *   2. OSs pagas — lista completa das ordens que fecharam no mês
 *   3. Despesas — lista das despesas pagas no mês
 *
 * Retorna um Buffer que o endpoint HTTP entrega como download.
 */

const NOMES_MES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const FMT_MOEDA = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00';
const FMT_DATA  = 'dd/mm/yyyy';

function estiloHeader(cell) {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF283090' } };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
  cell.border = { bottom: { style: 'thin', color: { argb: 'FF1e2470' } } };
}

function estiloTitulo(cell) {
  cell.font = { bold: true, size: 16, color: { argb: 'FF283090' } };
}

function estiloRotulo(cell) {
  cell.font = { size: 10, color: { argb: 'FF64748b' } };
  cell.alignment = { horizontal: 'right' };
}

async function gerarResumoMensal({ ano, mes }) {
  const y = Number(ano) || new Date().getFullYear();
  const m = Number(mes) || (new Date().getMonth() + 1);
  const inicio = `${y}-${String(m).padStart(2, '0')}-01`;
  const proxMes = m === 12 ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  // Coleta dados em paralelo
  const [painel, ossPagas, desps] = await Promise.all([
    relatorios.painelMes({ ano: y, mes: m }),
    financeiro.osDoMes({ ano: y, mes: m }),
    despesas.listarDespesas({
      inicio, fim: proxMes,
      escopo: 'oficina', por_pagina: 2000, pagina: 1,
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Auto Elétrica Maninho';
  wb.created = new Date();

  // ---------------------------------------------------------------- Aba 1: Resumo
  const w1 = wb.addWorksheet('Resumo');
  w1.columns = [
    { width: 30 }, { width: 22 }, { width: 22 }, { width: 22 },
  ];

  w1.getCell('A1').value = `Resumo Financeiro — ${NOMES_MES[m - 1]}/${y}`;
  estiloTitulo(w1.getCell('A1'));
  w1.mergeCells('A1:D1');

  w1.getCell('A2').value = 'Auto Elétrica Maninho · Gravataí/RS';
  w1.getCell('A2').font = { size: 10, color: { argb: 'FF94a3b8' } };
  w1.mergeCells('A2:D2');

  const linhas = [
    { l: 'Receita', v: painel.receita, moeda: true, cor: 'FF059669' },
    { l: 'Despesas pagas', v: painel.despesa, moeda: true, cor: 'FFDC2626' },
    { l: 'Lucro', v: painel.lucro, moeda: true, cor: painel.lucro >= 0 ? 'FF283090' : 'FFDC2626' },
    { l: '', v: '' },
    { l: 'Ordens de serviço pagas', v: painel.qtd_os },
    { l: 'Ticket médio', v: painel.ticket_medio, moeda: true },
    { l: 'Clientes atendidos', v: painel.clientes_atendidos },
    { l: 'Desconto total dado', v: painel.desconto_total_mes || 0, moeda: true },
    { l: '', v: '' },
    { l: 'Meta mensal', v: painel.meta || 0, moeda: true },
    { l: 'Projeção fechamento', v: painel.projecao_fechamento, moeda: true },
    { l: 'Dias restantes', v: painel.dias_restantes || 0 },
    { l: '', v: '' },
    { l: 'Mês anterior — receita', v: painel.comparativo?.mes_anterior || 0, moeda: true },
    { l: 'Variação %', v: painel.comparativo?.variacao_percentual ?? null },
  ];

  let linhaAtual = 4;
  linhas.forEach((l) => {
    if (!l.l) { linhaAtual++; return; }
    const r = w1.getRow(linhaAtual);
    r.getCell(1).value = l.l;
    r.getCell(1).font = { size: 11 };
    r.getCell(2).value = l.v;
    if (l.moeda) {
      r.getCell(2).numFmt = FMT_MOEDA;
      r.getCell(2).font = { bold: true, size: 11, color: { argb: l.cor || 'FF0f172a' } };
    } else if (typeof l.v === 'number') {
      r.getCell(2).numFmt = '#,##0.##';
      r.getCell(2).font = { size: 11 };
    }
    linhaAtual++;
  });

  // ---------------------------------------------------------------- Aba 2: OSs pagas
  const w2 = wb.addWorksheet('OSs pagas');
  w2.columns = [
    { header: 'Nº OS', key: 'numero', width: 10 },
    { header: 'Data pagamento', key: 'paga_em', width: 15 },
    { header: 'Cliente', key: 'cliente', width: 32 },
    { header: 'Placa', key: 'placa', width: 12 },
    { header: 'Veículo', key: 'veiculo', width: 24 },
    { header: 'Forma pagto', key: 'forma', width: 18 },
    { header: 'Valor total', key: 'valor_total', width: 15 },
    { header: 'Valor pago', key: 'valor_pago', width: 15 },
  ];
  w2.getRow(1).eachCell(estiloHeader);
  w2.views = [{ state: 'frozen', ySplit: 1 }];

  const FORMAS_LABEL = {
    dinheiro: 'Dinheiro', pix: 'PIX', boleto: 'Boleto',
    cartao_credito: 'Cartão crédito', cartao_debito: 'Cartão débito',
    transferencia: 'Transferência', cheque: 'Cheque', outro: 'Outro',
  };

  ossPagas.dados.forEach((os) => {
    const row = w2.addRow({
      numero: os.numero_os,
      paga_em: os.paga_em ? new Date(os.paga_em) : null,
      cliente: os.cliente_nome,
      placa: os.placa,
      veiculo: `${os.marca || ''} ${os.modelo || ''}`.trim(),
      forma: FORMAS_LABEL[os.forma_pagamento] || os.forma_pagamento || '',
      valor_total: Number(os.valor_total),
      valor_pago: os.valor_pago != null ? Number(os.valor_pago) : Number(os.valor_total),
    });
    row.getCell('paga_em').numFmt = FMT_DATA;
    row.getCell('valor_total').numFmt = FMT_MOEDA;
    row.getCell('valor_pago').numFmt = FMT_MOEDA;
  });

  // Linha de total no final
  if (ossPagas.dados.length > 0) {
    const totalRow = w2.addRow({
      numero: '',
      paga_em: '',
      cliente: `TOTAL — ${ossPagas.totais.qtd} OS(s)`,
      placa: '',
      veiculo: '',
      forma: '',
      valor_total: '',
      valor_pago: ossPagas.totais.recebido,
    });
    totalRow.font = { bold: true };
    totalRow.getCell('valor_pago').numFmt = FMT_MOEDA;
    totalRow.getCell('valor_pago').font = { bold: true, color: { argb: 'FF059669' } };
  }

  // ---------------------------------------------------------------- Aba 3: Despesas
  const w3 = wb.addWorksheet('Despesas');
  w3.columns = [
    { header: 'Nº',            key: 'numero',      width: 8 },
    { header: 'Vencimento',    key: 'vencimento',  width: 13 },
    { header: 'Descrição',     key: 'descricao',   width: 40 },
    { header: 'Categoria',     key: 'categoria',   width: 20 },
    { header: 'Fornecedor',    key: 'fornecedor',  width: 24 },
    { header: 'Forma',         key: 'forma',       width: 14 },
    { header: 'Situação',      key: 'status',      width: 12 },
    { header: 'Valor',         key: 'valor',       width: 14 },
    { header: 'Data pagto',    key: 'pago_em',     width: 13 },
    { header: 'Valor pago',    key: 'valor_pago',  width: 14 },
  ];
  w3.getRow(1).eachCell(estiloHeader);
  w3.views = [{ state: 'frozen', ySplit: 1 }];

  const STATUS_LABEL = {
    pendente: 'Pendente', paga: 'Paga', atrasada: 'Atrasada', cancelada: 'Cancelada',
  };

  let totalPago = 0;
  let totalPendente = 0;
  desps.dados.forEach((d) => {
    const row = w3.addRow({
      numero: d.numero_despesa,
      vencimento: d.vencimento ? new Date(d.vencimento) : null,
      descricao: d.descricao,
      categoria: d.categoria_nome || '',
      fornecedor: d.fornecedor_nome || '',
      forma: FORMAS_LABEL[d.forma] || d.forma || '',
      status: STATUS_LABEL[d.status] || d.status,
      valor: Number(d.valor),
      pago_em: d.pago_em ? new Date(d.pago_em) : null,
      valor_pago: d.valor_pago != null ? Number(d.valor_pago) : null,
    });
    row.getCell('vencimento').numFmt = FMT_DATA;
    row.getCell('pago_em').numFmt = FMT_DATA;
    row.getCell('valor').numFmt = FMT_MOEDA;
    row.getCell('valor_pago').numFmt = FMT_MOEDA;
    if (d.status === 'atrasada') {
      row.getCell('status').font = { bold: true, color: { argb: 'FFDC2626' } };
    }
    if (d.status === 'paga') totalPago += Number(d.valor_pago ?? d.valor);
    else totalPendente += Number(d.valor);
  });

  if (desps.dados.length > 0) {
    w3.addRow([]);
    const tp = w3.addRow(['', '', 'TOTAL PAGO', '', '', '', '', '', '', totalPago]);
    tp.font = { bold: true };
    tp.getCell(10).numFmt = FMT_MOEDA;
    tp.getCell(10).font = { bold: true, color: { argb: 'FFDC2626' } };

    const tpend = w3.addRow(['', '', 'A PAGAR (pendente/atrasada)', '', '', '', '', totalPendente]);
    tpend.font = { bold: true };
    tpend.getCell(8).numFmt = FMT_MOEDA;
    tpend.getCell(8).font = { bold: true, color: { argb: 'FF64748b' } };
  }

  // ---------------------------------------------------------------- Aba 4: Top serviços
  if (painel.top_servicos?.length > 0) {
    const w4 = wb.addWorksheet('Top serviços');
    w4.columns = [
      { header: 'Serviço', key: 'nome', width: 40 },
      { header: 'Quantidade', key: 'qtd', width: 14 },
      { header: 'Receita', key: 'receita', width: 16 },
    ];
    w4.getRow(1).eachCell(estiloHeader);
    painel.top_servicos.forEach((s) => {
      const row = w4.addRow({
        nome: s.nome_servico,
        qtd: s.quantidade,
        receita: Number(s.receita),
      });
      row.getCell('receita').numFmt = FMT_MOEDA;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nomeArquivo = `resumo-${y}-${String(m).padStart(2, '0')}.xlsx`;
  return { buffer, nomeArquivo };
}

module.exports = { gerarResumoMensal };
