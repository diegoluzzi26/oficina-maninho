'use strict';
const db = require('../config/db');
const config = require('./config.service');
const assinatura = require('./assinatura.service');
const whatsapp = require('./whatsapp.service');
const AppError = require('../utils/AppError');
const { toE164 } = require('../utils/phone');

/**
 * Agendamento online: o cliente final marca horário sozinho pela página
 * pública /agendar/<slug>. A oficina coloca esse link no campo "Agendamento"
 * do Perfil da Empresa no Google (botão "Agendar" no Maps e na Busca).
 *
 * Sem JWT: a oficina sai do slug da URL e tudo roda em runComOficina(slug).
 * O pedido vira um agendamento normal da Agenda, com origem 'online'.
 *
 * Horários: grade fixa por dia (início/fim, sábado com fim próprio, pausa
 * de almoço), em passos de `intervalo` minutos, com `vagas` carros por
 * horário. Conta como ocupado todo agendamento 'agendado' (interno ou
 * online) que encosta no horário.
 */

// Brasil não tem horário de verão desde 2019: fuso fixo.
const TZ = '-03:00';

const PADRAO = {
  ativo: false,
  dias: [1, 2, 3, 4, 5, 6], // 0 = domingo
  inicio: '08:00',
  fim: '18:00',
  sabado_fim: '12:00',
  almoco_inicio: '12:00',
  almoco_fim: '13:30',
  intervalo: 60,
  vagas: 1,
  antecedencia_h: 2,
  dias_max: 30,
  mensagem: '',
};

const CHAVES = Object.keys(PADRAO);
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------------
// Config (tabela configuracoes, chaves agenda_online.*)
// ---------------------------------------------------------------------

function lerConfig() {
  const g = (k) => config.get(`agenda_online.${k}`, null);
  const num = (k) => (g(k) === null ? PADRAO[k] : Number(g(k)));
  // ' ' gravado = vazio de propósito (ver salvarConfig): volta como ''.
  const txt = (k) => (g(k) === null ? PADRAO[k] : g(k).trim());
  return {
    ativo: g('ativo') === 'true',
    dias: g('dias') === null
      ? PADRAO.dias
      : g('dias').split(',').filter(Boolean).map(Number),
    inicio: txt('inicio'),
    fim: txt('fim'),
    // '' = sábado igual aos outros dias
    sabado_fim: txt('sabado_fim'),
    almoco_inicio: txt('almoco_inicio'),
    almoco_fim: txt('almoco_fim'),
    intervalo: num('intervalo'),
    vagas: num('vagas'),
    antecedencia_h: num('antecedencia_h'),
    dias_max: num('dias_max'),
    mensagem: txt('mensagem'),
  };
}

/** Grava só o que veio. Campos de hora opcionais aceitam '' (= desligado). */
async function salvarConfig(dados, userId) {
  const atual = lerConfig();
  const novo = { ...atual, ...dados };
  if (minutos(novo.inicio) >= minutos(novo.fim)) {
    throw new AppError('O horário de início precisa ser antes do fim', 422);
  }
  if (Boolean(novo.almoco_inicio) !== Boolean(novo.almoco_fim)) {
    throw new AppError('Informe início e fim da pausa, ou deixe os dois vazios', 422);
  }
  if (novo.almoco_inicio && minutos(novo.almoco_inicio) >= minutos(novo.almoco_fim)) {
    throw new AppError('O início da pausa precisa ser antes do fim', 422);
  }

  for (const k of CHAVES) {
    if (dados[k] === undefined) continue;
    let v = dados[k];
    if (k === 'dias') v = [...new Set(v)].sort().join(',');
    else if (k === 'ativo') v = v ? 'true' : 'false';
    // Vazio vira a string vazia gravada (não o default): '' desliga sábado/pausa.
    // config.set apaga a chave quando recebe '', então guardamos um marcador.
    await config.set(`agenda_online.${k}`, v === '' ? ' ' : v, userId);
  }
  return lerConfig();
}

function minutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

function hhmm(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' de hoje no fuso da oficina. */
function hojeLocal(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

function diaDaSemana(dataISO) {
  return new Date(`${dataISO}T12:00:00${TZ}`).getUTCDay();
}

function somarDias(dataISO, n) {
  const d = new Date(`${dataISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Grade de horários do dia, sem olhar ocupação. Pura (testável).
 * Devolve [{ hora: 'HH:MM', inicio: Date, fim: Date }].
 */
function gradeDoDia(c, dataISO, agora = new Date()) {
  const hoje = hojeLocal(agora);
  if (dataISO < hoje || dataISO > somarDias(hoje, c.dias_max)) return [];

  const dow = diaDaSemana(dataISO);
  if (!c.dias.includes(dow)) return [];

  const ini = minutos(c.inicio);
  const fim = minutos(dow === 6 && c.sabado_fim ? c.sabado_fim : c.fim);
  const pausa = c.almoco_inicio && c.almoco_fim
    ? [minutos(c.almoco_inicio), minutos(c.almoco_fim)] : null;
  const limite = agora.getTime() + c.antecedencia_h * 3600 * 1000;

  const slots = [];
  for (let t = ini; t + c.intervalo <= fim; t += c.intervalo) {
    if (pausa && t < pausa[1] && t + c.intervalo > pausa[0]) continue;
    const inicio = new Date(`${dataISO}T${hhmm(t)}:00${TZ}`);
    if (inicio.getTime() < limite) continue;
    slots.push({ hora: hhmm(t), inicio, fim: new Date(inicio.getTime() + c.intervalo * 60000) });
  }
  return slots;
}

/** Quantos agendamentos ativos encostam em cada horário da grade. */
function marcarOcupacao(slots, ocupados, vagas) {
  return slots.filter((s) => {
    const n = ocupados.filter((o) => {
      const oi = new Date(o.data_agendada).getTime();
      const of = oi + o.duracao_min * 60000;
      return oi < s.fim.getTime() && of > s.inicio.getTime();
    }).length;
    return n < vagas;
  });
}

async function ocupadosNoDia(q, dataISO) {
  const { rows } = await q.query(
    `SELECT data_agendada, duracao_min FROM agendamentos
      WHERE status = 'agendado'
        AND data_agendada < ($1::date + 1 + time '00:00') AT TIME ZONE 'America/Sao_Paulo'
        AND data_agendada + duracao_min * interval '1 minute'
            > ($1::date + time '00:00') AT TIME ZONE 'America/Sao_Paulo'`,
    [dataISO],
  );
  return rows;
}

async function horariosLivres(dataISO, q = db) {
  const cfg = lerConfig();
  const grade = gradeDoDia(cfg, dataISO);
  if (!grade.length) return [];
  return marcarOcupacao(grade, await ocupadosNoDia(q, dataISO), cfg.vagas);
}

// ---------------------------------------------------------------------
// Contexto público: oficina pelo slug
// ---------------------------------------------------------------------

/**
 * Oficina ativa, com assinatura em dia e agendamento online ligado.
 * Precisa rodar dentro de runComOficina(slug) com a config carregada.
 */
async function oficinaPublica(slug) {
  const { rows } = await db.pool.query(
    `SELECT id, slug, nome, cor_primaria, cor_secundaria, endereco, cidade, uf, telefone,
            CASE WHEN logo IS NULL THEN NULL
                 ELSE (extract(epoch FROM logo_atualizada_em) * 1000)::bigint::text END AS logo_versao
       FROM oficinas WHERE slug = $1 AND ativo`, [slug],
  );
  const o = rows[0];
  const indisponivel = AppError.notFound('Agendamento online indisponível para esta oficina');
  if (!o) throw indisponivel;
  const ass = await assinatura.daOficina(o.id);
  if (ass?.avaliacao?.bloqueada) throw indisponivel;
  if (!lerConfig().ativo) throw indisponivel;
  return o;
}

async function dadosPublicos(slug) {
  const oficina = await oficinaPublica(slug);
  const cfg = lerConfig();
  const { rows: servicos } = await db.query(
    'SELECT id, nome FROM servicos WHERE ativo ORDER BY nome',
  );
  const hoje = hojeLocal();
  return {
    oficina: {
      slug: oficina.slug, nome: oficina.nome,
      cor_primaria: oficina.cor_primaria, cor_secundaria: oficina.cor_secundaria,
      logo_versao: oficina.logo_versao,
      endereco: oficina.endereco, cidade: oficina.cidade, uf: oficina.uf,
      telefone: oficina.telefone,
    },
    agenda: {
      dias: cfg.dias,
      primeiro_dia: hoje,
      ultimo_dia: somarDias(hoje, cfg.dias_max),
      mensagem: cfg.mensagem,
    },
    servicos,
  };
}

// ---------------------------------------------------------------------
// Limites anti-abuso (memória do processo, como no cadastro)
// ---------------------------------------------------------------------

const LIMITE_IP = Number(process.env.AGENDA_ONLINE_LIMITE_IP) || 5;    // por hora
const LIMITE_DIA = Number(process.env.AGENDA_ONLINE_LIMITE_DIA) || 40; // por oficina
const HORA = 60 * 60 * 1000;
const porIp = new Map();     // ip -> [timestamps]
const porOficina = new Map(); // slug -> { data, total }

function checarLimites(slug, ip, agora = Date.now()) {
  const hoje = hojeLocal(new Date(agora));
  const d = porOficina.get(slug);
  if (d && d.data === hoje && d.total >= LIMITE_DIA) {
    throw new AppError('Agenda online lotada hoje. Ligue ou chame a oficina no WhatsApp.', 429);
  }
  const recentes = (porIp.get(ip) || []).filter((t) => agora - t < HORA);
  if (recentes.length >= LIMITE_IP) {
    throw new AppError('Muitas tentativas. Tente de novo daqui a pouco.', 429);
  }
  porIp.set(ip, recentes);
}

function contar(slug, ip, agora = Date.now()) {
  const hoje = hojeLocal(new Date(agora));
  porIp.set(ip, [...(porIp.get(ip) || []), agora]);
  const d = porOficina.get(slug);
  porOficina.set(slug, d && d.data === hoje ? { data: hoje, total: d.total + 1 } : { data: hoje, total: 1 });
}

function _zerarLimites() { porIp.clear(); porOficina.clear(); }

// ---------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------

/**
 * Cria o agendamento pedido pelo cliente.
 * Cliente: achado pelo telefone; se não existe, nasce com nome+telefone.
 * Carro: achado pela placa (é única na oficina); se não existe, nasce
 * no nome desse cliente. Se a placa já é de outro cliente, usa o carro
 * mesmo assim e avisa na observação pro atendente conferir.
 */
async function agendar(slug, dados, ip) {
  const oficina = await oficinaPublica(slug);
  checarLimites(slug, ip);
  const cfg = lerConfig();
  const telefone = toE164(dados.telefone);
  const placa = dados.placa;

  const ag = await db.withTransaction(async (client) => {
    // Serializa os pedidos online da oficina: dois clientes não levam a
    // mesma última vaga.
    await client.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':agenda_online'))");

    const livres = await horariosLivres(dados.data, client);
    const slot = livres.find((s) => s.hora === dados.hora);
    if (!slot) {
      throw new AppError('Esse horário acabou de ser ocupado. Escolha outro, por favor.', 409);
    }

    let clienteId;
    const c = await client.query(
      'SELECT id FROM clientes WHERE telefone = $1 ORDER BY criado_em LIMIT 1', [telefone],
    );
    if (c.rows[0]) {
      clienteId = c.rows[0].id;
    } else {
      const novo = await client.query(
        'INSERT INTO clientes (nome, telefone) VALUES ($1, $2) RETURNING id',
        [dados.nome, telefone],
      );
      clienteId = novo.rows[0].id;
    }

    const avisos = [];
    let carroId;
    const ca = await client.query(
      `SELECT id, cliente_id FROM carros
        WHERE upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) = $1`, [placa],
    );
    if (ca.rows[0]) {
      carroId = ca.rows[0].id;
      if (ca.rows[0].cliente_id !== clienteId) {
        avisos.push(`placa ${placa} já cadastrada em outro cliente — conferir`);
      }
    } else {
      const novo = await client.query(
        `INSERT INTO carros (cliente_id, placa, marca, modelo)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [clienteId, placa, dados.marca, dados.modelo],
      );
      carroId = novo.rows[0].id;
    }

    const obs = [
      `Agendado online por ${dados.nome}`,
      dados.observacoes,
      ...avisos,
    ].filter(Boolean).join(' — ');

    const { rows } = await client.query(
      `INSERT INTO agendamentos (cliente_id, carro_id, data_agendada, duracao_min,
                                 observacoes, origem)
       VALUES ($1, $2, $3, $4, $5, 'online') RETURNING id`,
      [clienteId, carroId, slot.inicio.toISOString(), cfg.intervalo, obs],
    );
    const id = rows[0].id;

    const nomesServicos = [];
    if (dados.servico_ids?.length) {
      const s = await client.query(
        'SELECT id, nome FROM servicos WHERE ativo AND id = ANY($1::uuid[])', [dados.servico_ids],
      );
      for (const sv of s.rows) {
        await client.query(
          `INSERT INTO agendamento_servicos (agendamento_id, servico_id, nome_servico)
           VALUES ($1, $2, $3)`, [id, sv.id, sv.nome],
        );
        nomesServicos.push(sv.nome);
      }
    }
    return { id, cliente_id: clienteId, servicos: nomesServicos };
  });

  contar(slug, ip);
  // Avisos por WhatsApp não podem derrubar o agendamento já gravado.
  avisarWhatsApp(oficina, dados, telefone, ag).catch((err) => {
    console.error(`[agenda-online] ${slug}: aviso WhatsApp falhou:`, err.message);
  });

  return { id: ag.id, data: dados.data, hora: dados.hora, oficina: oficina.nome };
}

function dataBR(dataISO) {
  const [y, m, d] = dataISO.split('-');
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return `${dias[diaDaSemana(dataISO)]}, ${d}/${m}/${y}`;
}

async function avisarWhatsApp(oficina, dados, telefone, ag) {
  if (!(await assinatura.recursoNaOficinaAtual('whatsapp'))) return;
  if (!config.whatsapp().enabled) return;
  const quando = `${dataBR(dados.data)} às ${dados.hora}`;
  const servico = ag.servicos.length ? ag.servicos.join(', ') : (dados.observacoes || 'não informado');

  await whatsapp.notificar({
    telefone,
    cliente_id: ag.cliente_id,
    mensagem: `Olá, ${dados.nome.split(' ')[0]}! Seu horário na ${oficina.nome} está marcado para `
      + `${quando} (${dados.marca} ${dados.modelo}, placa ${dados.placa}). `
      + 'Se precisar remarcar, é só responder esta mensagem.',
  });

  const dono = config.alerta().whatsapp;
  if (dono) {
    await whatsapp.notificar({
      telefone: dono,
      mensagem: `📅 Novo agendamento online\n${dados.nome} — ${dados.marca} ${dados.modelo} (${dados.placa})\n`
        + `${quando}\nServiço: ${servico}`,
    });
  }
}

module.exports = {
  PADRAO, lerConfig, salvarConfig, gradeDoDia, marcarOcupacao, horariosLivres,
  dadosPublicos, oficinaPublica, agendar,
  checarLimites, contar, _zerarLimites, hojeLocal,
};
