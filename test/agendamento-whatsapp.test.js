'use strict';
/**
 * Mensagem de WhatsApp ao cliente quando o agendamento é marcado/remarcado.
 * Puro, sem banco.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mensagemAgendamento } = require('../src/services/agendamentos.service');

const AG = {
  cliente_nome: 'João da Silva',
  marca: 'VW', modelo: 'Gol', placa: 'ABC1D23',
  data_agendada: '2026-11-17T12:00:00Z', // terça 09:00 em Brasília
  servicos: [{ nome_servico: 'Troca de óleo' }, { nome_servico: 'Alinhamento' }],
};

test('marcado: primeiro nome, oficina, dia/hora local, carro e serviços', () => {
  const m = mensagemAgendamento(AG, 'marcado', 'Auto Elétrica Maninho');
  assert.match(m, /^Olá, João! /);
  assert.match(m, /na Auto Elétrica Maninho está marcado para terça, 17\/11 às 09:00/);
  assert.match(m, /\(VW Gol, placa ABC1D23\)/);
  assert.match(m, /Troca de óleo, Alinhamento/);
});

test('remarcado e sem serviços nem nome da oficina', () => {
  const m = mensagemAgendamento({ ...AG, servicos: [] }, 'remarcado', null);
  assert.match(m, /Seu horário foi remarcado para terça/);
  assert.doesNotMatch(m, / na /);
  assert.doesNotMatch(m, /—/);
});
