'use strict';
/**
 * Agendamento online: grade de horários, ocupação e limites. Puro, sem banco.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/services/agenda-online.service');

const CFG = { ...a.PADRAO, ativo: true };
// Segunda, 16/11/2026, 07:00 em Brasília.
const AGORA = new Date('2026-11-16T07:00:00-03:00');

test('grade de dia útil pula a pausa do almoço', () => {
  const horas = a.gradeDoDia(CFG, '2026-11-17', AGORA).map((s) => s.hora);
  // Pausa 12:00–13:30 derruba 12:00 e 13:00 (que invadiria a pausa).
  assert.deepEqual(horas, ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00']);
});

test('sábado fecha mais cedo e domingo não abre', () => {
  assert.deepEqual(
    a.gradeDoDia(CFG, '2026-11-21', AGORA).map((s) => s.hora),
    ['08:00', '09:00', '10:00', '11:00'],
  );
  assert.deepEqual(a.gradeDoDia(CFG, '2026-11-22', AGORA), []);
});

test('respeita antecedência mínima, passado e limite de dias', () => {
  // Hoje 07:00 com 2h de antecedência: primeiro horário é 09:00.
  assert.equal(a.gradeDoDia(CFG, '2026-11-16', AGORA)[0].hora, '09:00');
  assert.deepEqual(a.gradeDoDia(CFG, '2026-11-15', AGORA), []);
  assert.deepEqual(a.gradeDoDia(CFG, '2026-12-17', AGORA), []); // além de 30 dias
});

test('sábado vazio e sem pausa usam o dia inteiro', () => {
  const cfg = { ...CFG, sabado_fim: '', almoco_inicio: '', almoco_fim: '', intervalo: 120 };
  assert.deepEqual(
    a.gradeDoDia(cfg, '2026-11-21', AGORA).map((s) => s.hora),
    ['08:00', '10:00', '12:00', '14:00', '16:00'],
  );
});

test('horário com agendamento ocupando todas as vagas some', () => {
  const grade = a.gradeDoDia(CFG, '2026-11-17', AGORA);
  const ocupados = [
    { data_agendada: '2026-11-17T09:30:00-03:00', duracao_min: 60 }, // encosta em 09 e 10
  ];
  const livres = a.marcarOcupacao(grade, ocupados, 1).map((s) => s.hora);
  assert.ok(!livres.includes('09:00') && !livres.includes('10:00'));
  assert.ok(livres.includes('08:00') && livres.includes('11:00'));
  // Com 2 vagas, um carro não lota o horário.
  assert.equal(a.marcarOcupacao(grade, ocupados, 2).length, grade.length);
});

test('limita pedidos por IP por hora', () => {
  a._zerarLimites();
  const t = Date.now();
  for (let i = 0; i < 5; i += 1) {
    a.checarLimites('oficina_x', '1.1.1.1', t);
    a.contar('oficina_x', '1.1.1.1', t);
  }
  assert.throws(() => a.checarLimites('oficina_x', '1.1.1.1', t), { statusCode: 429 });
  a.checarLimites('oficina_x', '2.2.2.2', t);
  a.checarLimites('oficina_x', '1.1.1.1', t + 61 * 60 * 1000);
  a._zerarLimites();
});
