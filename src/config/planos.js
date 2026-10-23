'use strict';

/**
 * Planos comerciais — fonte única de preço, limite de usuários e recursos.
 * O valor gravado em public.oficinas.plano é a chave deste mapa
 * (CHECK em migrations/035_planos.sql).
 *
 * Recursos (o que o plano libera além do núcleo OS/clientes/agenda/financeiro):
 *   whatsapp      instância própria, envio de mensagens e relatórios
 *   followup      lembrete de revisão, retornos e régua de follow-up
 *   gestao        despesas recorrentes e DRE (fornecedores ficam no núcleo:
 *                 o lançamento de despesa depende deles)
 *   funcionarios  cadastro de funcionários / pessoal
 *   ia            recursos de IA
 *
 * Anual = 10 mensalidades (2 meses grátis). usuarios: null = ilimitado.
 */
const PLANOS = {
  essencial: {
    nome: 'Essencial',
    mensal: 59,
    anual: 590,
    usuarios: 2,
    recursos: [],
  },
  profissional: {
    nome: 'Profissional',
    mensal: 119,
    anual: 1190,
    usuarios: 5,
    recursos: ['whatsapp', 'followup', 'gestao', 'funcionarios'],
  },
  completo: {
    nome: 'Completo',
    mensal: 199,
    anual: 1990,
    usuarios: null,
    recursos: ['whatsapp', 'followup', 'gestao', 'funcionarios', 'ia'],
  },
};

const ORDEM = ['essencial', 'profissional', 'completo'];
const PLANO_PADRAO = 'profissional';

function doPlano(chave) {
  return PLANOS[chave] || PLANOS[PLANO_PADRAO];
}

function temRecurso(chave, recurso) {
  return doPlano(chave).recursos.includes(recurso);
}

/** Primeiro plano (do mais barato) que libera o recurso. */
function planoMinimo(recurso) {
  return ORDEM.find((k) => PLANOS[k].recursos.includes(recurso)) || null;
}

module.exports = { PLANOS, ORDEM, PLANO_PADRAO, doPlano, temRecurso, planoMinimo };
