'use strict';
/**
 * Popula o banco com dados de exemplo realistas.
 * Gera OS espalhadas nos últimos 6 meses para os gráficos terem forma.
 */
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

const CATALOGO = [
  ['Troca de alternador', 'Remoção, teste e instalação do alternador', 450.00, 120],
  ['Troca de bateria', 'Substituição e teste de carga', 180.00, 30],
  ['Revisão elétrica completa', 'Checagem de todo o sistema elétrico', 250.00, 90],
  ['Troca de motor de partida', 'Substituição do motor de arranque', 520.00, 150],
  ['Diagnóstico com scanner', 'Leitura e análise de códigos de falha', 120.00, 45],
  ['Injeção eletrônica - limpeza', 'Limpeza de bicos injetores', 380.00, 120],
  ['Recarga de ar condicionado', 'Recarga de gás e teste de estanqueidade', 290.00, 60],
  ['Higienização do ar condicionado', 'Limpeza do evaporador e troca do filtro', 160.00, 60],
  ['Troca de correia dentada', 'Substituição da correia e tensor', 680.00, 240],
  ['Instalação de som/multimídia', 'Instalação com chicote original', 220.00, 90],
  ['Reparo de chicote elétrico', 'Localização e reparo de mau contato', 300.00, 180],
  ['Troca de velas e cabos', 'Substituição do jogo completo', 210.00, 60],
];

const CLIENTES = [
  ['João Batista Silva', '+5551998801122', '123.456.789-00', 'Av. dos Municípios, 220 - Gravataí/RS'],
  ['Maria Aparecida Souza', '+5551998802233', '234.567.890-11', 'Rua Osvaldo Cruz, 55 - Gravataí/RS'],
  ['Carlos Eduardo Ramos', '+5551998803344', '345.678.901-22', 'RS-020, km 12 - Gravataí/RS'],
  ['Fernanda Lima Costa', '+5551998804455', '456.789.012-33', 'Rua Anápolis, 118 - Cachoeirinha/RS'],
  ['Roberto Carlos Menezes', '+5551998805566', '567.890.123-44', 'Av. Brasil, 900 - Alvorada/RS'],
  ['Transportes Bandeirante Ltda', '+5551998806677', '12.345.678/0001-90', 'Distrito Industrial - Gravataí/RS'],
  ['Ana Paula Rodrigues', '+5551998807788', '678.901.234-55', 'Rua São Miguel, 44 - Gravataí/RS'],
  ['Marcos Vinícius Alves', '+5551998808899', '789.012.345-66', 'Av. Central, 1500 - Gravataí/RS'],
];

const CARROS = [
  [0, 'IVQ0E58', 'Volkswagen', 'Jetta', 2014, 'Branco', 128000],
  [0, 'ABC1D23', 'Volkswagen', 'Gol', 2011, 'Prata', 187000],
  [1, 'EIF2G77', 'Honda', 'Civic', 2010, 'Prata', 165000],
  [2, 'JBP8I32', 'Jeep', 'Compass', 2022, 'Branco', 42000],
  [3, 'IXR9J88', 'Renault', 'Duster', 2016, 'Cinza', 98000],
  [4, 'JAJ9C38', 'Chevrolet', 'Onix', 2021, 'Preto', 51000],
  [5, 'QNY6J04', 'Ford', 'Ka', 2019, 'Branco', 143000],
  [5, 'NQZ7B12', 'Citroën', 'C4', 2013, 'Preto', 176000],
  [6, 'JBB8D41', 'Honda', 'Civic', 2020, 'Branco', 63000],
  [7, 'QFS0A45', 'Mercedes-Benz', 'CLA 45', 2018, 'Branco', 47000],
];


const FORNECEDORES = [
  ['Distribuidora Auto Peças RS', '11.222.333/0001-44', '+555132224455', 'Sr. Antônio'],
  ['Bateria Forte Ltda', '22.333.444/0001-55', '+555134887720', 'Marcelo'],
  ['Elétrica Sul Componentes', '33.444.555/0001-66', '+555133415580', 'Cláudia'],
  ['Rolamentos e Cia', '44.555.666/0001-77', '+555132119940', 'Jorge'],
  ['Ferramentas Gaúchas', '55.666.777/0001-88', '+555134402210', 'Paulo'],
];

const DESPESAS_FIXAS = [
  ['Aluguel do galpão', 'Aluguel', 1500.00, 'pix'],
  ['Energia elétrica', 'Energia e água', null, 'boleto'],
  ['Água', 'Energia e água', null, 'boleto'],
  ['Salário — mecânico', 'Salários', 1800.00, 'transferencia'],
  ['Salário — auxiliar', 'Salários', 1200.00, 'transferencia'],
  ['Simples Nacional', 'Impostos e taxas', null, 'boleto'],
  ['Internet e telefone', 'Outros', 150.00, 'boleto'],
];

const COMPRAS = [
  ['Compra de alternadores', 'Peças e materiais'],
  ['Compra de baterias', 'Peças e materiais'],
  ['Kit correias e tensores', 'Peças e materiais'],
  ['Velas e cabos de ignição', 'Peças e materiais'],
  ['Motor de partida remanufaturado', 'Peças e materiais'],
  ['Gás R134a — cilindro', 'Peças e materiais'],
  ['Relés e fusíveis (sortido)', 'Peças e materiais'],
  ['Multímetro digital', 'Ferramentas'],
  ['Jogo de chaves', 'Ferramentas'],
  ['Óleo lubrificante (caixa)', 'Peças e materiais'],
];

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const escolher = (arr) => arr[rnd(0, arr.length - 1)];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Limpando dados existentes...');
    await client.query(`TRUNCATE alertas_despesa, despesas, fornecedores, wa_messages, lembretes,
                        os_pecas, os_servicos, ordens_servico, carros, clientes, servicos, users
                        RESTART IDENTITY CASCADE`);

    // --- usuários ---
    const senhaAdmin = await bcrypt.hash('admin123', 10);
    const senhaAtend = await bcrypt.hash('atendente123', 10);
    const admin = await client.query(
      `INSERT INTO users (nome,email,senha_hash,role) VALUES ($1,$2,$3,'admin') RETURNING id`,
      ['Administrador', 'admin@maninho.com.br', senhaAdmin],
    );
    await client.query(
      `INSERT INTO users (nome,email,senha_hash,role) VALUES ($1,$2,$3,'atendente')`,
      ['Atendente', 'atendente@maninho.com.br', senhaAtend],
    );
    const adminId = admin.rows[0].id;
    console.log('  ✓ 2 usuários');

    // --- catálogo ---
    const servicoIds = [];
    for (const [nome, desc, valor, tempo] of CATALOGO) {
      const r = await client.query(
        `INSERT INTO servicos (nome,descricao,valor_padrao,tempo_estimado_min)
         VALUES ($1,$2,$3,$4) RETURNING id, valor_padrao`,
        [nome, desc, valor, tempo],
      );
      servicoIds.push({ id: r.rows[0].id, nome, valor: Number(r.rows[0].valor_padrao) });
    }
    console.log(`  ✓ ${CATALOGO.length} serviços no catálogo`);

    // --- clientes ---
    const clienteIds = [];
    for (const [nome, tel, doc, end] of CLIENTES) {
      const r = await client.query(
        `INSERT INTO clientes (nome,telefone,cpf_cnpj,endereco) VALUES ($1,$2,$3,$4) RETURNING id`,
        [nome, tel, doc, end],
      );
      clienteIds.push(r.rows[0].id);
    }
    console.log(`  ✓ ${CLIENTES.length} clientes`);

    // --- carros ---
    const carros = [];
    for (const [idxCliente, placa, marca, modelo, ano, cor, km] of CARROS) {
      const r = await client.query(
        `INSERT INTO carros (cliente_id,placa,marca,modelo,ano,cor,km_atual)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [clienteIds[idxCliente], placa, marca, modelo, ano, cor, km],
      );
      carros.push({ id: r.rows[0].id, clienteId: clienteIds[idxCliente], km });
    }
    console.log(`  ✓ ${CARROS.length} carros`);

    // --- ordens de serviço espalhadas em 6 meses ---
    let pagas = 0; let abertas = 0;
    for (let i = 0; i < 60; i += 1) {
      const carro = escolher(carros);
      const diasAbertura = rnd(1, 180);
      const abertaEm = diasAtras(diasAbertura);

      const r = await client.query(
        `INSERT INTO ordens_servico (cliente_id,carro_id,km_entrada,aberta_em,criado_por,observacoes)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [carro.clienteId, carro.id, carro.km - rnd(0, 20000), abertaEm, adminId,
          escolher(['Cliente relatou falha ao dar partida', 'Barulho no motor',
            'Ar não gela', 'Luz da injeção acesa', 'Revisão preventiva', null])],
      );
      const osId = r.rows[0].id;

      // 1 a 3 serviços; valor cobrado varia ±15% do catálogo (negociação real)
      const usados = new Set();
      for (let s = 0; s < rnd(1, 3); s += 1) {
        const serv = escolher(servicoIds);
        if (usados.has(serv.id)) continue;
        usados.add(serv.id);
        const variacao = 1 + (rnd(-15, 15) / 100);
        await client.query(
          `INSERT INTO os_servicos (os_id,servico_id,nome_servico,quantidade,valor_unit)
           VALUES ($1,$2,$3,1,$4)`,
          [osId, serv.id, serv.nome, (serv.valor * variacao).toFixed(2)],
        );
      }

      // ~60% levam peça
      if (Math.random() < 0.6) {
        const peca = escolher([
          ['Bateria 60Ah', 320.00], ['Alternador remanufaturado', 480.00],
          ['Jogo de velas', 120.00], ['Filtro de cabine', 65.00],
          ['Correia dentada', 180.00], ['Gás R134a (kg)', 90.00],
          ['Relé auxiliar', 45.00], ['Motor de partida', 550.00],
        ]);
        await client.query(
          `INSERT INTO os_pecas (os_id,descricao,quantidade,valor_unit) VALUES ($1,$2,$3,$4)`,
          [osId, peca[0], rnd(1, 2), peca[1]],
        );
      }

      if (Math.random() < 0.15) {
        await client.query('UPDATE ordens_servico SET desconto=$1 WHERE id=$2',
          [rnd(20, 100), osId]);
      }

      // OS antigas já foram pagas; recentes ainda estão na fila
      if (diasAbertura > 7) {
        const fechada = new Date(abertaEm.getTime() + rnd(1, 4) * 86400000);
        const paga = new Date(fechada.getTime() + rnd(0, 3) * 86400000);
        await client.query(
          `UPDATE ordens_servico SET status='paga', fechada_em=$1, paga_em=$2 WHERE id=$3`,
          [fechada, paga, osId],
        );
        pagas += 1;
      } else {
        await client.query('UPDATE ordens_servico SET status=$1 WHERE id=$2',
          [escolher(['aberta', 'em_andamento', 'finalizada']), osId]);
        abertas += 1;
      }
    }
    console.log(`  ✓ 60 ordens de serviço (${pagas} pagas, ${abertas} em andamento)`);

    // --- histórico de WhatsApp ---
    const clientesTel = await client.query('SELECT id, telefone FROM clientes LIMIT 4');
    for (const c of clientesTel.rows) {
      await client.query(
        `INSERT INTO wa_messages (wa_message_id,direction,kind,status,telefone,cliente_id,body,criado_em)
         VALUES ($1,'inbound','text','delivered',$2,$3,$4,$5)`,
        [`wamid.seed.in.${c.id.slice(0, 8)}`, c.telefone, c.id,
          'Boa tarde, meu carro já está pronto?', diasAtras(rnd(0, 3))],
      );
    }
    console.log('  ✓ mensagens de WhatsApp de exemplo');

    // --- fornecedores ---
    const fornIds = [];
    for (const [nome, cnpj, tel, contato] of FORNECEDORES) {
      const r = await client.query(
        `INSERT INTO fornecedores (nome,cnpj_cpf,telefone,contato) VALUES ($1,$2,$3,$4) RETURNING id`,
        [nome, cnpj, tel, contato],
      );
      fornIds.push(r.rows[0].id);
    }
    console.log(`  ✓ ${FORNECEDORES.length} fornecedores`);

    const cats = await client.query('SELECT id, nome FROM categorias_despesa');
    const catId = (nome) => cats.rows.find((c) => c.nome === nome)?.id || null;

    // --- despesas dos últimos 6 meses ---
    let nDesp = 0;
    for (let m = 5; m >= 0; m -= 1) {
      const base = new Date();
      base.setMonth(base.getMonth() - m, 1);
      const compet = base.toISOString().slice(0, 10);
      const ehMesAtual = m === 0;

      for (const [desc, cat, valorFixo, forma] of DESPESAS_FIXAS) {
        const valor = valorFixo || rnd(90, 320);
        const venc = new Date(base.getFullYear(), base.getMonth(), rnd(5, 25));
        const vencIso = venc.toISOString().slice(0, 10);
        // No mês atual parte fica em aberto, para os alertas terem conteúdo
        const pagar = !ehMesAtual || Math.random() < 0.55;
        await client.query(
          `INSERT INTO despesas (descricao,categoria_id,valor,forma,vencimento,competencia,status,pago_em,recorrente)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
          [desc, catId(cat), valor, forma, vencIso, compet,
            pagar ? 'paga' : 'pendente', pagar ? vencIso : null],
        );
        nDesp += 1;
      }

      for (let i = 0; i < rnd(2, 4); i += 1) {
        const [desc, cat] = escolher(COMPRAS);
        const valor = (rnd(90, 620) + Math.random()).toFixed(2);
        const venc = new Date(base.getFullYear(), base.getMonth(), rnd(3, 28));
        const vencIso = venc.toISOString().slice(0, 10);
        const pagar = !ehMesAtual || Math.random() < 0.5;
        await client.query(
          `INSERT INTO despesas (descricao,categoria_id,fornecedor_id,valor,forma,vencimento,competencia,status,pago_em,numero_doc)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [`${desc}`, catId(cat), escolher(fornIds), valor,
            escolher(['boleto', 'boleto', 'pix', 'cartao_credito']),
            vencIso, compet, pagar ? 'paga' : 'pendente', pagar ? vencIso : null,
            `NF-${rnd(1000, 9999)}`],
        );
        nDesp += 1;
      }
    }

    // Boletos próximos e um atrasado, para alimentar os alertas
    const proximos = [
      ['Compra de alternadores', 'Peças e materiais', 2340.00, 2],
      ['Energia elétrica — mês atual', 'Energia e água', 870.40, 5],
      ['Kit embreagem', 'Peças e materiais', 1180.00, -3],
      ['Simples Nacional', 'Impostos e taxas', 1420.00, 8],
    ];
    for (const [desc, cat, valor, dias] of proximos) {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      await client.query(
        `INSERT INTO despesas (descricao,categoria_id,fornecedor_id,valor,forma,vencimento,status,numero_doc)
         VALUES ($1,$2,$3,$4,'boleto',$5,'pendente',$6)`,
        [desc, catId(cat), escolher(fornIds), valor, d.toISOString().slice(0, 10),
          `NF-${rnd(1000, 9999)}`],
      );
      nDesp += 1;
    }
    await client.query('SELECT atualizar_despesas_atrasadas()');
    console.log(`  ✓ ${nDesp} despesas lançadas`);

    await client.query('COMMIT');

    const tot = await client.query(
      'SELECT count(*)::int q, COALESCE(sum(valor_total),0)::numeric v FROM vw_faturamento',
    );
    const fin = await client.query(
      `SELECT COALESCE(sum(valor),0)::numeric v, count(*)::int q,
              COALESCE(sum(valor) FILTER (WHERE status IN ('pendente','atrasada')),0)::numeric aberto
         FROM despesas`);
    console.log('\n=== Seed concluído ===');
    console.log(`Despesas: R$ ${Number(fin.rows[0].v).toFixed(2)} em ${fin.rows[0].q} lançamentos ` +
                `(R$ ${Number(fin.rows[0].aberto).toFixed(2)} em aberto)`);
    console.log(`Faturamento no histórico: R$ ${Number(tot.rows[0].v).toFixed(2)} em ${tot.rows[0].q} OS pagas`);
    console.log('\nLogin admin:     admin@maninho.com.br / admin123');
    console.log('Login atendente: atendente@maninho.com.br / atendente123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro no seed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
