'use strict';
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const config = require('./config.service');
const os = require('./os.service');
const wa = require('./whatsapp.service');

/**
 * Orçamento em PDF da OS, para mandar ao cliente antes de aprovar.
 *
 * O PDF sai do servidor (pdfkit, sem navegador) porque o mesmo arquivo
 * vai para dois lugares: download na tela da OS e anexo no WhatsApp.
 *
 * Layout: faixa da cor principal no topo, logo + "ORÇAMENTO / OS nº",
 * cliente e veículo, tabela de itens, total, condições, assinatura e
 * rodapé com o convite para aprovar pelo WhatsApp. Cores e dados de
 * contato vêm do cadastro da oficina (public.oficinas).
 *
 * Padrões das condições (sobrescrevíveis em `configuracoes`):
 *   orcamento.validade_dias  número de dias (padrão 7)
 *   orcamento.condicoes      linhas extras, separadas por quebra de linha;
 *                            substitui as 3 linhas fixas abaixo da validade
 */

const FONTES = path.join(__dirname, '..', 'assets', 'fonts');
const FONTE = {
  regular: path.join(FONTES, 'montserrat-latin-400-normal.woff'),
  medio: path.join(FONTES, 'montserrat-latin-500-normal.woff'),
  semi: path.join(FONTES, 'montserrat-latin-600-normal.woff'),
  bold: path.join(FONTES, 'montserrat-latin-700-normal.woff'),
  black: path.join(FONTES, 'montserrat-latin-800-normal.woff'),
};

const CONDICOES_PADRAO = [
  'Garantia de 3 meses nos serviços executados.',
  'Aceitamos cartão.',
  'Se, na desmontagem, aparecer outra peça danificada, avisamos antes e só fazemos com a sua autorização.',
];

const ESCURO = '#131318';
const CINZA = '#5b5e6b';
const LINHA = '#e4e5ec';
const ZEBRA = '#f6f7fb';

const mm = (v) => v * 2.8346;

function brl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    .replace(/ /g, ' ');
}

/** Data de hoje no fuso de Brasília, como Date à meia-noite UTC (só o dia importa). */
function hojeBrasil(agora = new Date()) {
  const [a, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function somarDias(dia, n) {
  return new Date(dia.getTime() + n * 86400000);
}

function dataBR(dia) {
  return dia.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function telefoneBR(t) {
  const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '';
}

/** Itens da OS na ordem da impressão: serviços, depois peças. */
function itensDaOS(ordem) {
  return [
    ...(ordem.servicos || []).map((s) => ({
      descricao: s.nome_servico, quantidade: Number(s.quantidade), total: Number(s.valor_total),
    })),
    ...(ordem.pecas || []).map((p) => ({
      descricao: p.descricao, quantidade: Number(p.quantidade), total: Number(p.valor_total),
    })),
  ];
}

function condicoes(validade) {
  const extra = config.get('orcamento.condicoes', null);
  const linhas = extra
    ? String(extra).split('\n').map((l) => l.trim()).filter(Boolean)
    : CONDICOES_PADRAO;
  return [`Orçamento válido até ${dataBR(validade)}.`, ...linhas];
}

function validadeDias() {
  const n = parseInt(config.get('orcamento.validade_dias', '7'), 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

/**
 * Monta o PDF. Função pura (não toca no banco) para dar para testar:
 *   oficina: { nome, cor_primaria, cor_secundaria, endereco, cidade, uf,
 *              telefone, especialidades, logo (Buffer), logo_mime }
 *   ordem:   o objeto de os.service.buscarPorId
 * Devolve Promise<Buffer>.
 */
function gerarPdf({ oficina, ordem, emitidoEm = hojeBrasil(), dias = 7, linhasCondicoes }) {
  const azul = oficina.cor_primaria || '#283090';
  const ouro = oficina.cor_secundaria || '#D4A843';
  const validade = somarDias(emitidoEm, dias);
  const conds = linhasCondicoes || [`Orçamento válido até ${dataBR(validade)}.`, ...CONDICOES_PADRAO];
  const itens = itensDaOS(ordem);
  const desconto = Number(ordem.desconto || 0);

  const doc = new PDFDocument({
    size: 'A4', margin: 0,
    info: { Title: `Orçamento OS nº ${ordem.numero_os} – ${oficina.nome}`, Author: oficina.nome },
  });
  Object.entries(FONTE).forEach(([nome, arq]) => doc.registerFont(nome, arq));

  const W = doc.page.width;
  const H = doc.page.height;
  const X = mm(16);
  const LARG = W - 2 * X;
  const RODAPE = mm(16);
  const LIMITE = H - RODAPE - mm(14);

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const pronto = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // ---------- rodapé e faixa do topo (toda página) ----------
  const faixaTopo = () => {
    doc.rect(0, 0, W, mm(5)).fill(azul);
    doc.rect(0, mm(5), W, mm(1.2)).fill(ouro);
  };
  const rodape = () => {
    const y = H - RODAPE;
    doc.rect(0, y - mm(1.2), W, mm(1.2)).fill(ouro);
    doc.rect(0, y, W, RODAPE).fill(azul);
    const ty = y + (RODAPE - 10) / 2;
    if (oficina.telefone) {
      doc.font('semi').fontSize(9.5).fillColor('#ffffff')
        .text('Para aprovar, é só responder no WhatsApp ', X, ty, { continued: true, lineBreak: false })
        .font('black').fillColor(ouro).text(telefoneBR(oficina.telefone), { lineBreak: false });
    } else {
      doc.font('semi').fontSize(9.5).fillColor('#ffffff')
        .text('Para aprovar, fale com a gente.', X, ty, { lineBreak: false });
    }
    doc.font('medio').fontSize(7.5).fillColor('#ffffff')
      .text(oficina.nome.toUpperCase(), X, ty + 1.5, { width: LARG, align: 'right', lineBreak: false });
  };
  const novaPagina = () => {
    doc.addPage({ size: 'A4', margin: 0 });
    faixaTopo();
    rodape();
    return mm(16);
  };

  faixaTopo();
  rodape();

  // ---------- cabeçalho ----------
  let y = mm(18);
  const logoOk = oficina.logo && /^image\/(png|jpe?g)$/.test(oficina.logo_mime || '');
  if (logoOk) {
    try {
      doc.image(oficina.logo, X, y, { fit: [mm(72), mm(26)], valign: 'center' });
    } catch {
      doc.font('black').fontSize(20).fillColor(azul).text(oficina.nome, X, y + mm(8), { width: mm(95) });
    }
  } else {
    doc.font('black').fontSize(20).fillColor(azul).text(oficina.nome, X, y + mm(8), { width: mm(95) });
  }

  doc.font('black').fontSize(22).fillColor(azul)
    .text('ORÇAMENTO', X, y, { width: LARG, align: 'right', characterSpacing: 1.2 });
  const rotulo = `OS nº ${ordem.numero_os}`;
  doc.font('bold').fontSize(10);
  const larRot = doc.widthOfString(rotulo) + mm(7);
  const yRot = y + 30;
  doc.roundedRect(X + LARG - larRot, yRot, larRot, 17, 2.5).fill(ouro);
  doc.fillColor(ESCURO).text(rotulo, X + LARG - larRot, yRot + 4, { width: larRot, align: 'center' });
  doc.font('regular').fontSize(9).fillColor(CINZA)
    .text(`Emitido em ${dataBR(emitidoEm)}`, X, yRot + 26, { width: LARG, align: 'right' })
    .text(`Válido até ${dataBR(validade)}`, X, yRot + 39, { width: LARG, align: 'right' });

  // ---------- linha de contato ----------
  y = mm(18) + mm(30);
  const cidadeUf = [oficina.cidade, oficina.uf].filter(Boolean).join('/');
  const contato = [
    [oficina.endereco, cidadeUf].filter(Boolean).join(' · '),
    oficina.telefone ? `WhatsApp ${telefoneBR(oficina.telefone)}` : null,
    oficina.especialidades,
  ].filter(Boolean).join('     |     ');
  doc.moveTo(X, y).lineTo(X + LARG, y).lineWidth(0.7).strokeColor(LINHA).stroke();
  if (contato) {
    doc.font('medio').fontSize(8.3).fillColor(CINZA)
      .text(contato, X, y + mm(2.6), { width: LARG, align: 'center' });
  }
  y += mm(9);
  doc.moveTo(X, y).lineTo(X + LARG, y).lineWidth(0.7).strokeColor(LINHA).stroke();

  // ---------- cliente e veículo ----------
  y += mm(6);
  const hCaixa = mm(19);
  const gap = mm(5);
  const lCli = (LARG - gap) * 0.565;
  const lVei = LARG - gap - lCli;
  const caixa = (cx, lw, rotuloCx, titulo, sub) => {
    doc.roundedRect(cx, y, lw, hCaixa, 4).lineWidth(0.7).strokeColor(LINHA).stroke();
    doc.rect(cx, y, mm(1.4), hCaixa).fill(azul);
    doc.font('bold').fontSize(7.2).fillColor(CINZA)
      .text(rotuloCx, cx + mm(4.5), y + mm(3.3), { characterSpacing: 1.3 });
    doc.font('bold').fontSize(11.5).fillColor(ESCURO)
      .text(titulo, cx + mm(4.5), y + mm(7), { width: lw - mm(8), lineBreak: false, ellipsis: true });
    if (sub) {
      doc.font('regular').fontSize(9).fillColor(CINZA)
        .text(sub, cx + mm(4.5), y + mm(12.5), { width: lw - mm(8), lineBreak: false, ellipsis: true });
    }
  };
  caixa(X, lCli, 'CLIENTE', ordem.cliente_nome || '—', telefoneBR(ordem.cliente_telefone));
  const veiculo = [ordem.marca, ordem.modelo].filter(Boolean).join(' ') + (ordem.ano ? ` · ${ordem.ano}` : '');
  caixa(X + lCli + gap, lVei, 'VEÍCULO', veiculo || '—', ordem.placa ? `Placa ${ordem.placa}` : null);
  y += hCaixa + mm(8);

  // ---------- tabela de itens ----------
  const cQtd = mm(18);
  const cVal = mm(34);
  const cN = mm(13);
  const cDesc = LARG - cN - cQtd - cVal;
  const pad = mm(4);

  const titulo = (ty) => {
    doc.font('bold').fontSize(8.5).fillColor(azul).text('SERVIÇOS E PEÇAS', X, ty, { characterSpacing: 1.5 });
    return ty + mm(5);
  };
  const cabecalhoTabela = (ty) => {
    doc.rect(X, ty, LARG, mm(8)).fill(azul);
    doc.font('semi').fontSize(8).fillColor('#ffffff');
    const ly = ty + mm(2.7);
    doc.text('ITEM', X + pad, ly, { characterSpacing: 1 });
    doc.text('DESCRIÇÃO', X + cN + pad, ly, { characterSpacing: 1 });
    doc.text('QTD', X + cN + cDesc, ly, { width: cQtd, align: 'center', characterSpacing: 1 });
    doc.text('VALOR', X + cN + cDesc + cQtd, ly, { width: cVal - pad, align: 'right', characterSpacing: 1 });
    return ty + mm(8);
  };

  y = cabecalhoTabela(titulo(y));
  if (itens.length === 0) {
    doc.font('regular').fontSize(10).fillColor(CINZA)
      .text('Nenhum item lançado nesta OS.', X, y + mm(4), { width: LARG, align: 'center' });
    y += mm(12);
  }
  itens.forEach((it, i) => {
    doc.font('medio').fontSize(10.3);
    const hTexto = doc.heightOfString(it.descricao, { width: cDesc - 2 * pad });
    const hLinha = Math.max(mm(10), hTexto + mm(6));
    if (y + hLinha > LIMITE) y = cabecalhoTabela(novaPagina());
    if (i % 2 === 1) doc.rect(X, y, LARG, hLinha).fill(ZEBRA);
    const ty = y + (hLinha - hTexto) / 2;
    doc.font('semi').fontSize(10).fillColor(CINZA).text(String(i + 1).padStart(2, '0'), X + pad, ty);
    doc.font('medio').fontSize(10.3).fillColor(ESCURO).text(it.descricao, X + cN + pad, ty, { width: cDesc - 2 * pad });
    const qtd = Number.isInteger(it.quantidade) ? String(it.quantidade) : it.quantidade.toLocaleString('pt-BR');
    doc.font('medio').fontSize(10).fillColor(CINZA).text(qtd, X + cN + cDesc, ty, { width: cQtd, align: 'center' });
    doc.font('semi').fontSize(10.3).fillColor(ESCURO)
      .text(brl(it.total), X + cN + cDesc + cQtd, ty, { width: cVal - pad, align: 'right' });
    y += hLinha;
    doc.moveTo(X, y).lineTo(X + LARG, y).lineWidth(0.7).strokeColor(LINHA).stroke();
  });

  // ---------- desconto e total ----------
  const blocoFinal = mm(16) + (desconto > 0 ? mm(8) : 0);
  if (y + blocoFinal > LIMITE) y = novaPagina();
  if (desconto > 0) {
    y += mm(2.5);
    doc.font('semi').fontSize(10).fillColor('#be123c')
      .text('Desconto', X + pad, y)
      .text(`− ${brl(desconto)}`, X, y, { width: LARG - pad, align: 'right' });
    y += mm(5.5);
  }
  y += mm(4);
  const hTotal = mm(14);
  doc.roundedRect(X, y, LARG, hTotal, 4).fill(ESCURO);
  doc.font('bold').fontSize(10).fillColor('#ffffff')
    .text('TOTAL DO ORÇAMENTO', X + mm(5), y + hTotal / 2 - 6, { characterSpacing: 2 });
  doc.font('black').fontSize(19).fillColor(ouro)
    .text(brl(ordem.valor_total), X, y + hTotal / 2 - 12, { width: LARG - mm(5), align: 'right' });
  y += hTotal + mm(8);

  // ---------- condições ----------
  doc.font('regular').fontSize(9.4);
  const hConds = conds.reduce((s, c) => s + doc.heightOfString(c, { width: LARG - mm(5) }) + mm(1.6), mm(6));
  if (y + hConds + mm(22) > LIMITE) y = novaPagina();
  doc.font('bold').fontSize(8.5).fillColor(azul).text('CONDIÇÕES', X, y, { characterSpacing: 1.5 });
  y += mm(5);
  conds.forEach((c) => {
    doc.rect(X, y + 3, mm(2), mm(2)).fill(ouro);
    doc.font('regular').fontSize(9.4).fillColor(ESCURO).text(c, X + mm(5), y, { width: LARG - mm(5) });
    y = doc.y + mm(1.6);
  });

  // ---------- assinatura ----------
  y = Math.min(Math.max(y + mm(14), LIMITE - mm(10)), LIMITE);
  const lAss = (LARG - mm(10)) * 0.62;
  doc.moveTo(X, y).lineTo(X + lAss, y).lineWidth(0.8).strokeColor(ESCURO).stroke();
  doc.moveTo(X + lAss + mm(10), y).lineTo(X + LARG, y).stroke();
  doc.font('regular').fontSize(8.3).fillColor(CINZA)
    .text('De acordo – assinatura do cliente', X, y + mm(1.8))
    .text('Data: ____/____/________', X + lAss + mm(10), y + mm(1.8));

  doc.end();
  return pronto;
}

async function oficinaParaPdf(oficinaId) {
  const { rows } = await db.pool.query(
    `SELECT nome, cor_primaria, cor_secundaria, endereco, cidade, uf, telefone,
            especialidades, logo, logo_mime
       FROM oficinas WHERE id = $1`, [oficinaId],
  );
  if (!rows[0]) throw AppError.notFound('Oficina não encontrada');
  return rows[0];
}

/** Gera o PDF do orçamento de uma OS da oficina logada. */
async function pdfDaOS(osId, oficinaId) {
  const [ordem, oficina] = await Promise.all([os.buscarPorId(osId), oficinaParaPdf(oficinaId)]);
  const emitidoEm = hojeBrasil();
  const dias = validadeDias();
  const validade = somarDias(emitidoEm, dias);
  const buffer = await gerarPdf({
    oficina, ordem, emitidoEm, dias, linhasCondicoes: condicoes(validade),
  });
  return { buffer, ordem, oficina, validade, nomeArquivo: `orcamento-os-${ordem.numero_os}.pdf` };
}

function legendaWhatsApp({ ordem, oficina, validade }) {
  const primeiroNome = String(ordem.cliente_nome || '').trim().split(/\s+/)[0] || '';
  const carro = [ordem.marca, ordem.modelo].filter(Boolean).join(' ');
  return `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Segue o orçamento da OS nº ${ordem.numero_os}`
    + `${carro ? ` do seu ${carro}` : ''}: total de ${brl(ordem.valor_total)}, válido até ${dataBR(validade)}.\n`
    + `Para aprovar, é só responder por aqui. — ${oficina.nome}`;
}

/** Gera o PDF e manda como documento no WhatsApp do cliente da OS. */
async function enviarPorWhatsApp(osId, oficinaId) {
  const r = await pdfDaOS(osId, oficinaId);
  if (!r.ordem.cliente_telefone) {
    throw new AppError('Cliente sem telefone cadastrado. Cadastre o WhatsApp dele antes de enviar.', 422);
  }
  if (r.ordem.status === 'paga') {
    throw new AppError('OS já paga: mande o recibo, não o orçamento.', 409);
  }
  const msg = await wa.enviarDocumento({
    telefone: r.ordem.cliente_telefone,
    base64: r.buffer.toString('base64'),
    nomeArquivo: r.nomeArquivo,
    legenda: legendaWhatsApp(r),
    cliente_id: r.ordem.cliente_id,
    os_id: r.ordem.id,
  });
  return { enviado: true, id: msg?.id || null, para: telefoneBR(r.ordem.cliente_telefone) };
}

module.exports = {
  gerarPdf, pdfDaOS, enviarPorWhatsApp, legendaWhatsApp,
  // exportados para teste
  itensDaOS, hojeBrasil, somarDias, dataBR, brl,
};
