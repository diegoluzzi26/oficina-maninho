'use strict';
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const { formatBR } = require('../utils/phone');
const config = require('./config.service');
const os = require('./os.service');
const wa = require('./whatsapp.service');

/**
 * Orçamento da OS em PDF (A4), pronto pra mandar ao cliente.
 *
 * Logo, cores, endereço e telefone vêm do cadastro de cada oficina. O que o
 * cadastro ainda não tem (garantia, Instagram, horário) fica em EXTRAS, por
 * slug: garantia é compromisso comercial e não pode sair no papel de uma
 * oficina que não a oferece.
 *
 * Sobrescrevíveis em `configuracoes`, por oficina:
 *   orcamento.validade_dias  dias de validade (padrão 7)
 *   orcamento.condicoes      condições próprias, uma por linha; substituem
 *                            as de EXTRAS. Validade e autorização sempre saem.
 */
const EXTRAS = {
  maninho: {
    primaria: '#283090',
    secundaria: '#D4A843',
    whatsapp: '(51) 99658-7778',
    instagram: '@autoeletrica_maninho',
    horario: 'Seg a sex · 8h às 18h30',
    desde: 'DESDE 1997',
    condicoes: ['Garantia de 3 meses nos serviços executados.', 'Aceitamos cartão.'],
  },
};

const VALIDADE_PADRAO = 7;
const AUTORIZACAO = 'Se, na desmontagem, aparecer outra peça danificada, avisamos antes e só fazemos com a sua autorização.';
const ESCURO = '#131318';
const CINZA = '#5b5e6b';
const LINHA = '#e4e5ec';
const ZEBRA = '#f6f7fb';

const L = 595.28; // largura A4 em pt
const A = 841.89; // altura A4 em pt
const M = 45;     // margem lateral
const RODAPE = 52;
const LIMITE = A - RODAPE - 24;

// Colunas da tabela de itens
const C_ITEM = 51;
const C_QTD = 44;
const C_VALOR = 96;

const FONTES = path.join(__dirname, '..', 'assets', 'fonts');
const FONTE = {
  regular: 'montserrat-latin-400-normal.woff',
  medio: 'montserrat-latin-500-normal.woff',
  semi: 'montserrat-latin-600-normal.woff',
  bold: 'montserrat-latin-700-normal.woff',
  black: 'montserrat-latin-800-normal.woff',
};

function brl(v) {
  const [int, dec] = Number(v).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

/** Data de hoje no fuso de Brasília, como objeto em UTC (só o dia importa). */
function hojeSP(agora = new Date()) {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
  return new Date(`${iso}T00:00:00Z`);
}
const somarDias = (dia, n) => new Date(dia.getTime() + n * 86400000);
const dataBR = (d) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const qtdBR = (n) => String(Number(n)).replace('.', ',');

async function dadosOficina(oficinaId) {
  const { rows } = await db.query(
    `SELECT slug, nome, logo, logo_mime, cor_primaria, cor_secundaria,
            endereco, cidade, uf, telefone
       FROM public.oficinas WHERE id = $1`,
    [oficinaId],
  );
  if (!rows[0]) throw AppError.notFound('Oficina não encontrada');
  return rows[0];
}

/** Serviços e depois peças, numa lista só, como aparecem pro cliente. */
function montarItens(ordem) {
  const linha = (descricao, quantidade, total) => ({
    descricao, quantidade: Number(quantidade), valor: Number(total),
  });
  return [
    ...(ordem.servicos || []).map((s) => linha(s.nome_servico, s.quantidade, s.valor_total)),
    ...(ordem.pecas || []).map((p) => linha(p.descricao, p.quantidade, p.valor_total)),
  ];
}

/** Condições específicas da oficina: as configuradas ou as de EXTRAS. */
function condicoesDaOficina(slug, configuradas) {
  if (configuradas) {
    return String(configuradas).split('\n').map((l) => l.trim()).filter(Boolean);
  }
  return EXTRAS[slug]?.condicoes || [];
}

function validadeConfigurada() {
  const n = parseInt(config.get('orcamento.validade_dias', VALIDADE_PADRAO), 10);
  return Number.isFinite(n) && n > 0 ? n : VALIDADE_PADRAO;
}

/** Monta o PDF, sem tocar no banco. Devolve Promise<Buffer>. */
function renderizar({ ordem, oficina, itens, emissao, dias, condicoes }) {
  const extras = EXTRAS[oficina.slug] || {};
  const primaria = oficina.cor_primaria || extras.primaria || '#1e293b';
  const secundaria = oficina.cor_secundaria || extras.secundaria || '#94a3b8';
  const whatsapp = extras.whatsapp || oficina.telefone || '';
  const validade = somarDias(emissao, dias);
  const LARG = L - 2 * M;

  const doc = new PDFDocument({
    size: 'A4', margin: 0,
    info: { Title: `Orçamento OS ${ordem.numero_os}`, Author: oficina.nome },
  });
  Object.entries(FONTE).forEach(([nome, arq]) => doc.registerFont(nome, path.join(FONTES, arq)));

  const partes = [];
  doc.on('data', (b) => partes.push(b));
  const pronto = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const texto = (t, x, y, opts = {}) => {
    const { fonte = 'regular', tam = 10, cor = ESCURO, ...resto } = opts;
    doc.font(fonte).fontSize(tam).fillColor(cor).text(t, x, y, { lineBreak: false, ...resto });
  };
  const moldura = () => {
    doc.rect(0, 0, L, 14).fill(primaria);
    doc.rect(0, 14, L, 3.4).fill(secundaria);
    doc.rect(0, A - RODAPE - 3.4, L, 3.4).fill(secundaria);
    doc.rect(0, A - RODAPE, L, RODAPE).fill(primaria);
    texto(whatsapp ? `Para aprovar, é só responder no WhatsApp ${whatsapp}` : 'Para aprovar, é só responder esta mensagem.',
      M, A - RODAPE + 20, { fonte: 'semi', tam: 9.5, cor: '#ffffff' });
    if (extras.desde) {
      texto(extras.desde, M, A - RODAPE + 21, { fonte: 'medio', tam: 8, cor: '#ffffff', width: LARG, align: 'right' });
    }
  };

  // ---- cabeçalho
  moldura();
  // pdfkit só embute PNG e JPEG; logo em WebP cai no nome da oficina.
  const temLogo = oficina.logo && /png|jpe?g/i.test(oficina.logo_mime || '');
  if (temLogo) {
    doc.image(oficina.logo, M, 34, { fit: [190, 62], valign: 'center' });
  } else {
    doc.font('black').fontSize(18).fillColor(primaria).text(oficina.nome, M, 48, { width: 270 });
  }
  texto('ORÇAMENTO', M, 34, { fonte: 'black', tam: 22, cor: primaria, width: LARG, align: 'right' });
  const selo = `OS nº ${ordem.numero_os}`;
  doc.font('bold').fontSize(10);
  const larguraSelo = doc.widthOfString(selo) + 20;
  doc.roundedRect(L - M - larguraSelo, 62, larguraSelo, 18, 3).fill(secundaria);
  texto(selo, L - M - larguraSelo, 66.5, { fonte: 'bold', width: larguraSelo, align: 'center' });
  texto(`Emitido em ${dataBR(emissao)}`, M, 87, { tam: 9, cor: CINZA, width: LARG, align: 'right' });
  texto(`Válido até ${dataBR(validade)}`, M, 99, { tam: 9, cor: CINZA, width: LARG, align: 'right' });

  // ---- linha de contato (só o que existir)
  const cidadeUf = [oficina.cidade, oficina.uf].filter(Boolean).join('/');
  const contato = [
    [oficina.endereco, cidadeUf].filter(Boolean).join(' · '),
    whatsapp && `WhatsApp ${whatsapp}`,
    extras.instagram,
    extras.horario,
  ].filter(Boolean).join('   |   ');
  doc.moveTo(M, 118).lineTo(L - M, 118).lineWidth(0.7).stroke(LINHA);
  if (contato) texto(contato, M, 125, { fonte: 'medio', tam: 7.6, cor: CINZA, width: LARG, align: 'center' });
  doc.moveTo(M, 140).lineTo(L - M, 140).lineWidth(0.7).stroke(LINHA);

  // ---- cliente e veículo
  const caixa = (x, largura, rotulo, valor, sub) => {
    // height + ellipsis corta nome grande em vez de vazar da caixa
    const corte = { width: largura - 24, height: 15, ellipsis: true, lineBreak: true };
    doc.roundedRect(x, 156, largura, 58, 4).lineWidth(0.7).stroke(LINHA);
    doc.rect(x, 156, 4, 58).fill(primaria);
    texto(rotulo, x + 14, 165, { fonte: 'bold', tam: 7.2, cor: CINZA, characterSpacing: 1.2 });
    texto(valor, x + 14, 177, { fonte: 'bold', tam: 11.5, ...corte });
    if (sub) texto(sub, x + 14, 195, { tam: 9, cor: CINZA, ...corte });
  };
  const larguraCliente = (LARG - 14) * 0.56;
  const detalheCarro = [ordem.ano, ordem.placa].filter(Boolean).join(' · ');
  caixa(M, larguraCliente, 'CLIENTE', ordem.cliente_nome, formatBR(ordem.cliente_telefone));
  caixa(M + larguraCliente + 14, LARG - 14 - larguraCliente, 'VEÍCULO',
    `${ordem.marca} ${ordem.modelo}`, detalheCarro);

  // ---- itens
  let y = 236;
  const titulo = (t) => {
    texto(t, M, y, { fonte: 'bold', tam: 8.5, cor: primaria, characterSpacing: 1.4 });
    y += 16;
  };
  const novaPagina = () => {
    doc.addPage({ size: 'A4', margin: 0 });
    moldura();
    y = 40;
  };
  const garantir = (altura) => { if (y + altura > LIMITE) novaPagina(); };
  const xQtd = M + LARG - C_VALOR - C_QTD;
  const xValor = M + LARG - C_VALOR;
  const cabecalhoTabela = () => {
    const cab = { fonte: 'semi', tam: 8, cor: '#ffffff' };
    doc.rect(M, y, LARG, 22).fill(primaria);
    texto('ITEM', M + 11, y + 7, cab);
    texto('DESCRIÇÃO', M + C_ITEM, y + 7, cab);
    texto('QTD', xQtd, y + 7, { ...cab, width: C_QTD, align: 'center' });
    texto('VALOR', xValor, y + 7, { ...cab, width: C_VALOR - 11, align: 'right' });
    y += 22;
  };

  titulo('SERVIÇOS E PEÇAS');
  cabecalhoTabela();
  const larguraDescricao = LARG - C_ITEM - C_QTD - C_VALOR - 8;
  itens.forEach((item, i) => {
    doc.font('medio').fontSize(10);
    const alturaTexto = doc.heightOfString(item.descricao, { width: larguraDescricao });
    const altura = Math.max(26, alturaTexto + 14);
    if (y + altura > LIMITE) { novaPagina(); cabecalhoTabela(); }
    if (i % 2 === 1) doc.rect(M, y, LARG, altura).fill(ZEBRA);
    texto(String(i + 1).padStart(2, '0'), M + 11, y + 8, { fonte: 'semi', cor: CINZA });
    doc.font('medio').fontSize(10).fillColor(ESCURO)
      .text(item.descricao, M + C_ITEM, y + 7, { width: larguraDescricao });
    texto(qtdBR(item.quantidade), xQtd, y + 8, { fonte: 'medio', cor: CINZA, width: C_QTD, align: 'center' });
    texto(brl(item.valor), xValor, y + 8, { fonte: 'semi', width: C_VALOR - 11, align: 'right' });
    y += altura;
    doc.moveTo(M, y).lineTo(L - M, y).lineWidth(0.7).stroke(LINHA);
  });

  // ---- total
  const desconto = Number(ordem.desconto) || 0;
  garantir(80);
  y += 10;
  if (desconto > 0) {
    texto('Desconto', M + 11, y, { fonte: 'semi', cor: CINZA });
    texto(`− ${brl(desconto)}`, M, y, { fonte: 'semi', cor: CINZA, width: LARG - 11, align: 'right' });
    y += 18;
  }
  doc.roundedRect(M, y, LARG, 44, 4).fill(ESCURO);
  texto('TOTAL DO ORÇAMENTO', M + 14, y + 17, { fonte: 'bold', cor: '#ffffff', characterSpacing: 1.6 });
  texto(brl(ordem.valor_total), M, y + 11, { fonte: 'black', tam: 19, cor: secundaria, width: LARG - 14, align: 'right' });
  y += 62;

  // ---- condições e assinatura ficam juntas, sem quebrar no meio
  const linhas = [
    `Orçamento válido por ${dias} dias (até ${dataBR(validade)}).`,
    ...condicoes,
    AUTORIZACAO,
  ];
  doc.font('regular').fontSize(9.2);
  const larguraCond = LARG - 14;
  const alturaCond = linhas.reduce((s, c) => s + doc.heightOfString(c, { width: larguraCond }) + 5, 16);
  garantir(alturaCond + 60);
  titulo('CONDIÇÕES');
  for (const c of linhas) {
    doc.rect(M, y + 3, 5.5, 5.5).fill(secundaria);
    doc.font('regular').fontSize(9.2).fillColor(ESCURO).text(c, M + 14, y, { width: larguraCond });
    y = doc.y + 5;
  }
  y += 34;
  const larguraAssinatura = (LARG - 28) * 0.62;
  doc.moveTo(M, y).lineTo(M + larguraAssinatura, y).lineWidth(0.7).stroke(ESCURO);
  doc.moveTo(M + larguraAssinatura + 28, y).lineTo(L - M, y).lineWidth(0.7).stroke(ESCURO);
  texto('De acordo – assinatura do cliente', M, y + 5, { tam: 8.2, cor: CINZA });
  texto('Data: ____/____/________', M + larguraAssinatura + 28, y + 5, { tam: 8.2, cor: CINZA });

  doc.end();
  return pronto;
}

/** Nome de arquivo sem acento nem caractere estranho. */
function nomeArquivo(ordem) {
  const limpa = (s) => String(s || '').normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '');
  const cliente = String(ordem.cliente_nome || '').trim().split(/\s+/)[0];
  return `Orcamento_OS${ordem.numero_os}_${limpa(cliente)}_${limpa(ordem.modelo)}.pdf`;
}

async function gerar(osId, oficinaId) {
  const ordem = await os.buscarPorId(osId);
  const itens = montarItens(ordem);
  if (!itens.length) {
    throw new AppError('Lance ao menos um serviço ou peça antes de gerar o orçamento', 422);
  }
  const oficina = await dadosOficina(oficinaId);
  const emissao = hojeSP();
  const dias = validadeConfigurada();
  const condicoes = condicoesDaOficina(oficina.slug, config.get('orcamento.condicoes', null));
  const pdf = await renderizar({ ordem, oficina, itens, emissao, dias, condicoes });
  return { pdf, nome: nomeArquivo(ordem), ordem, oficina, validade: somarDias(emissao, dias) };
}

function legendaWhatsApp({ ordem, oficina, validade }) {
  const primeiroNome = String(ordem.cliente_nome || '').trim().split(/\s+/)[0];
  return `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Segue o orçamento da OS nº ${ordem.numero_os} `
    + `do seu ${ordem.marca} ${ordem.modelo}: total de ${brl(ordem.valor_total)}, `
    + `válido até ${dataBR(validade)}.\n`
    + `Para aprovar, é só responder por aqui. — ${oficina.nome}`;
}

/** Só roda quando alguém confirma o envio na tela da OS. */
async function enviarWhatsApp(osId, oficinaId) {
  const r = await gerar(osId, oficinaId);
  if (r.ordem.status === 'paga') {
    throw new AppError('OS já paga: mande o recibo, não o orçamento', 409);
  }
  if (!r.ordem.cliente_telefone) {
    throw new AppError('Cliente sem telefone cadastrado', 422);
  }
  const msg = await wa.enviarDocumento({
    telefone: r.ordem.cliente_telefone,
    arquivo: r.pdf,
    nomeArquivo: r.nome,
    legenda: legendaWhatsApp(r),
    cliente_id: r.ordem.cliente_id,
    os_id: r.ordem.id,
  });
  return { enviado: true, id: msg.id, telefone: r.ordem.cliente_telefone };
}

module.exports = {
  gerar, enviarWhatsApp,
  // exportados para teste
  renderizar, montarItens, condicoesDaOficina, legendaWhatsApp, hojeSP, somarDias, dataBR,
};
