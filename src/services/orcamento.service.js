'use strict';
const PDFDocument = require('pdfkit');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const { formatBR } = require('../utils/phone');
const os =require('./os.service');
const wa = require('./whatsapp.service');

/**
 * Orçamento da OS em PDF (A4), pronto pra mandar ao cliente.
 *
 * Logo, cores, endereço e telefone vêm do cadastro de cada oficina. O que o
 * cadastro ainda não tem (garantia, Instagram, horário) fica em EXTRAS, por
 * slug: garantia é compromisso comercial e não pode sair no papel de uma
 * oficina que não a oferece.
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

const VALIDADE_DIAS = 7;
const ESCURO = '#131318';
const CINZA = '#5b5e6b';
const LINHA = '#e4e5ec';
const ZEBRA = '#f6f7fb';

const L = 595.28; // largura A4 em pt
const A = 841.89; // altura A4 em pt
const M = 45;     // margem lateral
const RODAPE = 52;
const LIMITE = A - RODAPE - 24;

function brl(v) {
  const [int, dec] = Number(v).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

/** Data de hoje no fuso da oficina, como objeto em UTC (só o dia importa). */
function hojeSP() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return new Date(`${iso}T00:00:00Z`);
}
const dataBR = (d) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const qtd = (n) => String(Number(n)).replace('.', ',');

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

/** Serviços e peças numa lista só, como aparecem pro cliente. */
function montarItens(ordem) {
  const linha = (descricao, q, total) => ({
    descricao: Number(q) > 1 ? `${descricao} (${qtd(q)}×)` : descricao,
    valor: Number(total),
  });
  return [
    ...(ordem.servicos || []).map((s) => linha(s.nome_servico, s.quantidade, s.valor_total)),
    ...(ordem.pecas || []).map((p) => linha(p.descricao, p.quantidade, p.valor_total)),
  ];
}

function renderizar(ordem, oficina, itens) {
  const extras = EXTRAS[oficina.slug] || {};
  const primaria = oficina.cor_primaria || extras.primaria || '#1e293b';
  const secundaria = oficina.cor_secundaria || extras.secundaria || '#94a3b8';
  const whatsapp = extras.whatsapp || oficina.telefone || '';
  const emissao = hojeSP();
  const validade = new Date(emissao.getTime() + VALIDADE_DIAS * 86400000);

  const doc = new PDFDocument({
    size: 'A4', margin: 0,
    info: { Title: `Orçamento OS ${ordem.numero_os}`, Author: oficina.nome },
  });
  const partes = [];
  doc.on('data', (b) => partes.push(b));
  const pronto = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);
  });

  const texto = (t, x, y, opts = {}) => {
    const { fonte = 'Helvetica', tam = 10, cor = ESCURO, ...resto } = opts;
    doc.font(fonte).fontSize(tam).fillColor(cor).text(t, x, y, { lineBreak: false, ...resto });
  };
  const faixaTopo = () => {
    doc.rect(0, 0, L, 14).fill(primaria);
    doc.rect(0, 14, L, 3.4).fill(secundaria);
  };

  // ---- cabeçalho
  faixaTopo();
  // pdfkit só embute PNG e JPEG; logo em WebP cai no nome da oficina.
  const temLogo = oficina.logo && /png|jpe?g/i.test(oficina.logo_mime || '');
  if (temLogo) {
    doc.image(oficina.logo, M, 34, { fit: [190, 62], valign: 'center' });
  } else {
    doc.font('Helvetica-Bold').fontSize(19).fillColor(primaria)
      .text(oficina.nome, M, 48, { width: 270 });
  }
  texto('ORÇAMENTO', M, 36, { fonte: 'Helvetica-Bold', tam: 22, cor: primaria, width: L - 2 * M, align: 'right' });
  const selo = `OS nº ${ordem.numero_os}`;
  doc.font('Helvetica-Bold').fontSize(10);
  const larguraSelo = doc.widthOfString(selo) + 20;
  doc.roundedRect(L - M - larguraSelo, 62, larguraSelo, 18, 3).fill(secundaria);
  texto(selo, L - M - larguraSelo, 67, { fonte: 'Helvetica-Bold', width: larguraSelo, align: 'center' });
  texto(`Emitido em ${dataBR(emissao)}`, M, 87, { tam: 9, cor: CINZA, width: L - 2 * M, align: 'right' });
  texto(`Válido até ${dataBR(validade)}`, M, 99, { tam: 9, cor: CINZA, width: L - 2 * M, align: 'right' });

  // ---- linha de contato (só o que existir)
  const cidadeUf = [oficina.cidade, oficina.uf].filter(Boolean).join('/');
  const contato = [
    [oficina.endereco, cidadeUf].filter(Boolean).join(' · '),
    whatsapp && `WhatsApp ${whatsapp}`,
    extras.instagram,
    extras.horario,
  ].filter(Boolean).join('    |    ');
  doc.moveTo(M, 118).lineTo(L - M, 118).lineWidth(0.7).stroke(LINHA);
  if (contato) texto(contato, M, 125, { tam: 8.2, cor: CINZA, width: L - 2 * M, align: 'center' });
  doc.moveTo(M, 140).lineTo(L - M, 140).lineWidth(0.7).stroke(LINHA);

  // ---- cliente e veículo
  const caixa = (x, largura, rotulo, valor, sub) => {
    doc.roundedRect(x, 156, largura, 58, 4).lineWidth(0.7).stroke(LINHA);
    doc.rect(x, 156, 4, 58).fill(primaria);
    texto(rotulo, x + 14, 165, { fonte: 'Helvetica-Bold', tam: 7.5, cor: CINZA, characterSpacing: 1.2 });
    texto(valor, x + 14, 178, { fonte: 'Helvetica-Bold', tam: 12, width: largura - 24, ellipsis: true });
    if (sub) texto(sub, x + 14, 195, { tam: 9.5, cor: CINZA, width: largura - 24, ellipsis: true });
  };
  const larguraCliente = (L - 2 * M - 14) * 0.56;
  const detalheCarro = [ordem.ano, ordem.placa].filter(Boolean).join(' · ');
  caixa(M, larguraCliente, 'CLIENTE', ordem.cliente_nome, formatBR(ordem.cliente_telefone));
  caixa(M + larguraCliente + 14, L - 2 * M - 14 - larguraCliente, 'VEÍCULO',
    `${ordem.marca} ${ordem.modelo}`, detalheCarro);

  // ---- itens
  let y = 236;
  const titulo = (t) => {
    texto(t, M, y, { fonte: 'Helvetica-Bold', tam: 9, cor: primaria, characterSpacing: 1.4 });
    y += 16;
  };
  const novaPagina = () => {
    doc.addPage();
    faixaTopo();
    y = 40;
  };
  const garantir = (altura) => { if (y + altura > LIMITE) novaPagina(); };
  const cabecalhoTabela = () => {
    doc.rect(M, y, L - 2 * M, 22).fill(primaria);
    texto('ITEM', M + 11, y + 7, { fonte: 'Helvetica-Bold', tam: 8.5, cor: '#ffffff' });
    texto('DESCRIÇÃO', M + 51, y + 7, { fonte: 'Helvetica-Bold', tam: 8.5, cor: '#ffffff' });
    texto('VALOR', M, y + 7, { fonte: 'Helvetica-Bold', tam: 8.5, cor: '#ffffff', width: L - 2 * M - 11, align: 'right' });
    y += 22;
  };

  titulo('SERVIÇOS E PEÇAS');
  cabecalhoTabela();
  const larguraDescricao = L - 2 * M - 51 - 100;
  itens.forEach((item, i) => {
    doc.font('Helvetica').fontSize(10.5);
    const alturaTexto = doc.heightOfString(item.descricao, { width: larguraDescricao });
    const altura = Math.max(26, alturaTexto + 14);
    if (y + altura > LIMITE) { novaPagina(); cabecalhoTabela(); }
    if (i % 2 === 1) doc.rect(M, y, L - 2 * M, altura).fill(ZEBRA);
    texto(String(i + 1).padStart(2, '0'), M + 11, y + 8, { fonte: 'Helvetica-Bold', cor: CINZA });
    doc.font('Helvetica').fontSize(10.5).fillColor(ESCURO)
      .text(item.descricao, M + 51, y + 7, { width: larguraDescricao });
    texto(brl(item.valor), M, y + 8, { fonte: 'Helvetica-Bold', width: L - 2 * M - 11, align: 'right' });
    y += altura;
    doc.moveTo(M, y).lineTo(L - M, y).lineWidth(0.7).stroke(LINHA);
  });

  // ---- total
  const desconto = Number(ordem.desconto) || 0;
  garantir(70);
  y += 10;
  if (desconto > 0) {
    texto('Desconto', M + 11, y, { cor: CINZA });
    texto(`− ${brl(desconto)}`, M, y, { fonte: 'Helvetica-Bold', cor: CINZA, width: L - 2 * M - 11, align: 'right' });
    y += 18;
  }
  doc.roundedRect(M, y, L - 2 * M, 44, 4).fill(ESCURO);
  texto('TOTAL DO ORÇAMENTO', M + 14, y + 17, { fonte: 'Helvetica-Bold', cor: '#ffffff', characterSpacing: 1.6 });
  texto(brl(ordem.valor_total), M, y + 12, { fonte: 'Helvetica-Bold', tam: 19, cor: secundaria, width: L - 2 * M - 14, align: 'right' });
  y += 62;

  // ---- condições e assinatura ficam juntas, sem quebrar no meio
  const condicoes = [
    `Orçamento válido por ${VALIDADE_DIAS} dias (até ${dataBR(validade)}).`,
    ...(extras.condicoes || []),
    'Se, na desmontagem, aparecer outra peça danificada, avisamos antes e só fazemos com a sua autorização.',
  ];
  garantir(30 + condicoes.length * 26 + 60);
  titulo('CONDIÇÕES');
  doc.font('Helvetica').fontSize(9.6);
  for (const c of condicoes) {
    doc.rect(M, y + 3, 5.5, 5.5).fill(secundaria);
    doc.font('Helvetica').fontSize(9.6).fillColor(ESCURO).text(c, M + 14, y, { width: L - 2 * M - 14 });
    y = doc.y + 5;
  }
  y += 34;
  const larguraAssinatura = (L - 2 * M - 28) * 0.62;
  doc.moveTo(M, y).lineTo(M + larguraAssinatura, y).lineWidth(0.7).stroke(ESCURO);
  doc.moveTo(M + larguraAssinatura + 28, y).lineTo(L - M, y).lineWidth(0.7).stroke(ESCURO);
  texto('De acordo – assinatura do cliente', M, y + 5, { tam: 8.5, cor: CINZA });
  texto('Data: ____/____/________', M + larguraAssinatura + 28, y + 5, { tam: 8.5, cor: CINZA });

  // ---- rodapé
  doc.rect(0, A - RODAPE - 3.4, L, 3.4).fill(secundaria);
  doc.rect(0, A - RODAPE, L, RODAPE).fill(primaria);
  texto(whatsapp ? `Para aprovar, é só responder no WhatsApp ${whatsapp}` : 'Para aprovar, é só responder esta mensagem.',
    M, A - RODAPE + 20, { fonte: 'Helvetica-Bold', cor: '#ffffff' });
  if (extras.desde) {
    texto(extras.desde, M, A - RODAPE + 21, { tam: 8.5, cor: '#ffffff', width: L - 2 * M, align: 'right' });
  }

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
  const pdf = await renderizar(ordem, oficina, itens);
  return { pdf, nome: nomeArquivo(ordem), ordem, oficina };
}

/** Só roda quando alguém confirma o envio na tela da OS. */
async function enviarWhatsApp(osId, oficinaId) {
  const { pdf, nome, ordem, oficina } = await gerar(osId, oficinaId);
  const legenda = `Olá, ${ordem.cliente_nome}! Segue o orçamento da OS nº ${ordem.numero_os} `
    + `do seu ${ordem.marca} ${ordem.modelo}, no valor de ${brl(ordem.valor_total)}. `
    + `Para aprovar, é só responder por aqui. — ${oficina.nome}`;
  const r = await wa.enviarDocumento({
    telefone: ordem.cliente_telefone,
    arquivo: pdf,
    nomeArquivo: nome,
    legenda,
    cliente_id: ordem.cliente_id,
    os_id: ordem.id,
  });
  return { enviado: true, id: r.id, telefone: ordem.cliente_telefone };
}

module.exports = { gerar, enviarWhatsApp };
