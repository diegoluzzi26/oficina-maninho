'use strict';
/**
 * Oficina de DEMONSTRAÇÃO com dados fictícios (clientes, carros, OS, agenda e
 * despesas) pra tirar os prints da landing sem expor cliente de verdade.
 *
 * Só roda contra banco local (localhost/127.0.0.1) e com a API local no ar:
 *
 *   node scripts/seed-demo.js
 *
 * Login da demo: demo@gestaotorque.com.br / demo12345 (oficina "Auto Center Exemplo").
 * Rodar de novo apaga e recria a oficina demo.
 */
require('dotenv').config();

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error('Recusado: seed-demo só roda em banco local (DATABASE_URL em localhost).');
  process.exit(1);
}

const db = require('../src/config/db');
const prov = require('../src/services/provisionamento.service');

const API = process.env.API_URL || 'http://localhost:3000/api';
const SLUG = 'demo';
const ADMIN = { nome: 'Ricardo Almeida', email: 'demo@gestaotorque.com.br', senha: 'demo12345' };

let token = '';
async function api(metodo, caminho, body) {
  const res = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${metodo} ${caminho}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const hoje = new Date();
function dia(offset) {
  const d = new Date(hoje);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const CLIENTES = [
  ['Carlos Mendes', '(51) 99812-3401', ['QHB2C41', 'Volkswagen', 'Gol 1.6', 2016, 'Prata', 98400]],
  ['Ana Paula Rocha', '(51) 99733-1290', ['IVN5E22', 'Hyundai', 'HB20 1.0', 2019, 'Branco', 61200]],
  ['Rafael Souza', '(51) 98455-7812', ['JAR8F03', 'Fiat', 'Strada 1.4', 2018, 'Vermelho', 120300]],
  ['Júlia Ramos', '(51) 99610-4477', ['RKT1A90', 'Toyota', 'Corolla 2.0', 2021, 'Preto', 59800]],
  ['Marcos Teixeira', '(51) 98102-6650', ['IZD4B17', 'Chevrolet', 'Onix 1.0', 2020, 'Cinza', 74500]],
  ['Fernanda Lima', '(51) 99288-0031', ['QIP7H55', 'Renault', 'Kwid 1.0', 2022, 'Laranja', 32100]],
  ['Paulo Vieira', '(51) 98877-5320', ['IOS3C88', 'Volkswagen', 'Saveiro 1.6', 2015, 'Branco', 154000]],
  ['Beatriz Campos', '(51) 99145-9083', ['RLB6D21', 'Jeep', 'Renegade 1.8', 2019, 'Azul', 88200]],
  ['Eduardo Nunes', '(51) 98390-1144', ['JBT2E64', 'Ford', 'Ka 1.5', 2017, 'Prata', 101700]],
  ['Luciana Prado', '(51) 99502-7718', ['QJU9F12', 'Honda', 'HR-V 1.8', 2020, 'Cinza', 67400]],
  ['Gustavo Pires', '(51) 98213-4409', ['IXA5G36', 'Fiat', 'Uno 1.0', 2014, 'Branco', 167900]],
  ['Camila Duarte', '(51) 99076-2253', ['RMF4H70', 'Nissan', 'Kicks 1.6', 2021, 'Vermelho', 45300]],
  ['Roberto Farias', '(51) 98654-3381', ['IPE8J19', 'Chevrolet', 'S10 2.8', 2018, 'Preto', 142600]],
  ['Patrícia Gomes', '(51) 99877-6602', ['QKC3K45', 'Peugeot', '208 1.6', 2019, 'Branco', 70900]],
];

const SERVICOS = [
  ['Troca de óleo e filtro', 60, 6],
  ['Alinhamento e balanceamento', 120, null],
  ['Revisão 10 mil km', 280, 12],
  ['Diagnóstico de injeção eletrônica', 150, null],
  ['Troca de pastilhas de freio', 90, null],
  ['Higienização do ar-condicionado', 140, 12],
  ['Troca de embreagem', 450, null],
  ['Troca da correia dentada', 320, 24],
];

const PECAS = {
  'Troca de óleo e filtro': [['Óleo 5W30 sintético (4L)', 1, 189], ['Filtro de óleo', 1, 38]],
  'Revisão 10 mil km': [['Óleo 5W30 sintético (4L)', 1, 189], ['Filtro de ar', 1, 54], ['Filtro de combustível', 1, 46]],
  'Troca de pastilhas de freio': [['Jogo de pastilhas dianteiras', 1, 168]],
  'Troca de embreagem': [['Kit embreagem completo', 1, 890]],
  'Troca da correia dentada': [['Kit correia dentada + tensor', 1, 420]],
  'Higienização do ar-condicionado': [['Filtro de cabine', 1, 62]],
};

async function recriarOficina() {
  const antiga = await db.pool.query('SELECT id FROM oficinas WHERE slug = $1', [SLUG]);
  if (antiga.rows[0]) {
    const id = antiga.rows[0].id;
    await db.pool.query(`DROP SCHEMA IF EXISTS ${db.schemaSeguro(SLUG)} CASCADE`);
    await db.pool.query('DELETE FROM contrato_aceites WHERE oficina_id = $1', [id]);
    await db.pool.query('DELETE FROM users WHERE oficina_id = $1', [id]);
    await db.pool.query('DELETE FROM oficinas WHERE id = $1', [id]);
  }
  const of = await prov.criarOficina({ slug: SLUG, nome: 'Auto Center Exemplo', admin: ADMIN });
  await db.pool.query(
    `UPDATE oficinas SET plano = 'completo', assinatura_status = 'ativa',
            proximo_vencimento = CURRENT_DATE + 18, cidade = 'Porto Alegre', uf = 'RS',
            telefone = '(51) 3333-0000', especialidades = 'Mecânica · Injeção · Freios'
      WHERE id = $1`, [of.id],
  );
  return of;
}

(async () => {
  await recriarOficina();
  ({ token } = await api('POST', '/auth/login', { email: ADMIN.email, senha: ADMIN.senha, oficina_slug: SLUG }));

  // Termos de uso: aceita a versão vigente, se houver.
  await api('POST', '/contrato/aceitar', {}).catch(() => {});

  await api('POST', '/auth/usuarios', { nome: 'Juliana Costa', email: 'juliana@exemplo.com.br', senha: 'demo12345', role: 'atendente' });
  await api('POST', '/auth/usuarios', {
    nome: 'Diego Martins', email: 'diego@exemplo.com.br', senha: 'demo12345', role: 'basico',
    permissoes: ['agenda', 'ordens', 'clientes'],
  });

  const servicos = {};
  for (const [nome, valor, meses] of SERVICOS) {
    const s = await api('POST', '/servicos', { nome, valor_padrao: valor, intervalo_retorno_meses: meses });
    servicos[nome] = s.id;
  }

  const clientes = [];
  for (const [nome, telefone, [placa, marca, modelo, ano, cor, km]] of CLIENTES) {
    const c = await api('POST', '/clientes', { nome, telefone });
    const carro = await api('POST', '/carros', { cliente_id: c.id, placa, marca, modelo, ano, cor, km_atual: km });
    clientes.push({ ...c, carro, km });
  }

  const nomesServ = Object.keys(servicos);
  const formas = ['pix', 'cartao_credito', 'pix', 'dinheiro', 'cartao_debito', 'pix'];
  async function abrirOS(i, nomes, obs) {
    const c = clientes[i % clientes.length];
    const pecas = nomes.flatMap((n) => (PECAS[n] || []).map(([descricao, quantidade, valor_unit]) => ({ descricao, quantidade, valor_unit })));
    return api('POST', '/os', {
      cliente_id: c.id, carro_id: c.carro.id, km_entrada: c.km, observacoes: obs || null,
      servicos: nomes.map((n) => ({ servico_id: servicos[n] })), pecas,
    });
  }

  // OS pagas espalhadas pelos últimos 45 dias: alimentam painel e financeiro.
  for (let k = 0; k < 34; k += 1) {
    const nomes = [nomesServ[(k * 3) % nomesServ.length]];
    if (k % 3 === 0) nomes.push(nomesServ[(k * 5 + 1) % nomesServ.length]);
    const os = await abrirOS(k, [...new Set(nomes)]);
    await api('PATCH', `/os/${os.id}/status`, { status: 'em_andamento' });
    await api('PATCH', `/os/${os.id}/status`, { status: 'finalizada' });
    await api('PATCH', `/os/${os.id}/status`, {
      status: 'paga', forma_pagamento: formas[k % formas.length], pago_em: dia(-Math.floor(k * 1.3)),
    });
  }

  // Pátio de hoje: OS em cada etapa do Kanban.
  const patio = [
    [0, ['Troca de pastilhas de freio'], 'Barulho ao frear', 'aberta'],
    [1, ['Diagnóstico de injeção eletrônica'], 'Luz da injeção acesa', 'aberta'],
    [2, ['Troca de embreagem'], 'Embreagem patinando', 'em_andamento'],
    [3, ['Revisão 10 mil km'], null, 'em_andamento'],
    [4, ['Diagnóstico de injeção eletrônica'], 'Falhando em marcha lenta', 'em_andamento'],
    [5, ['Troca de óleo e filtro'], null, 'finalizada'],
    [6, ['Alinhamento e balanceamento'], 'Puxando pra direita', 'finalizada'],
  ];
  for (const [i, nomes, obs, status] of patio) {
    const os = await abrirOS(i + 7, nomes, obs);
    if (status !== 'aberta') await api('PATCH', `/os/${os.id}/status`, { status: 'em_andamento' });
    if (status === 'finalizada') await api('PATCH', `/os/${os.id}/status`, { status: 'finalizada' });
  }

  // Agenda dos próximos dias.
  const horarios = [[0, '14:00'], [1, '08:30'], [1, '10:00'], [2, '09:00'], [3, '13:30'], [5, '08:00']];
  for (const [n, [d, hora]] of horarios.entries()) {
    const c = clientes[(n * 2 + 3) % clientes.length];
    await api('POST', '/agendamentos', {
      cliente_id: c.id, carro_id: c.carro.id, data_agendada: `${dia(d)}T${hora}`, duracao_min: 60,
      servicos: [{ servico_id: servicos[nomesServ[n % nomesServ.length]] }],
    }).catch((e) => console.warn('agendamento:', e.message));
  }

  // Despesas do mês.
  const despesas = [
    ['Aluguel do galpão', 3200, dia(-18), true],
    ['Energia elétrica', 640.5, dia(-6), true],
    ['Compra de peças (distribuidora)', 2380, dia(-3), true],
    ['Internet e telefone', 189.9, dia(4), false],
    ['Contador', 450, dia(7), false],
    ['Compra de óleo e filtros', 1260, dia(12), false],
  ];
  for (const [descricao, valor, vencimento, paga] of despesas) {
    const d = await api('POST', '/despesas', { descricao, valor, vencimento, forma: 'boleto' });
    if (paga) await api('PATCH', `/despesas/${d.id}/pagar`, { pago_em: vencimento });
  }

  console.log('Oficina demo pronta. Login: demo@gestaotorque.com.br / demo12345 (Auto Center Exemplo).');
  await db.pool.end();
})().catch(async (err) => {
  console.error(err);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
