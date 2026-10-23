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
 *   fiscal        emissão de NFS-e/NF-e (só via adicional, ver ADICIONAIS)
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

/**
 * Adicionais: contratados à parte, somam na mensalidade. A chave é o valor
 * gravado em public.oficinas.adicionais (CHECK em migrations/040_adicionais.sql)
 * e também o recurso que libera. `planos` = em quais planos pode ser
 * contratado; num plano fora da lista o adicional fica inativo (não libera
 * nem cobra) até a oficina voltar a um plano compatível.
 */
const ADICIONAIS = {
  fiscal: {
    nome: 'Nota fiscal',
    descricao: 'Emissão de NFS-e e NF-e direto da OS',
    mensal: 39,
    anual: 390,
    planos: ['profissional', 'completo'],
  },
};

function doPlano(chave) {
  return PLANOS[chave] || PLANOS[PLANO_PADRAO];
}

/** Adicionais contratados que valem no plano atual (os demais ficam inativos). */
function adicionaisAtivos(chavePlano, adicionais) {
  const plano = PLANOS[chavePlano] ? chavePlano : PLANO_PADRAO;
  return (adicionais || []).filter((a) => ADICIONAIS[a]?.planos.includes(plano));
}

/** Recursos liberados: os do plano + os dos adicionais ativos. */
function recursosDe(chavePlano, adicionais) {
  return [...doPlano(chavePlano).recursos, ...adicionaisAtivos(chavePlano, adicionais)];
}

function temRecurso(chave, recurso, adicionais) {
  return recursosDe(chave, adicionais).includes(recurso);
}

/** Primeiro plano (do mais barato) que libera o recurso. */
function planoMinimo(recurso) {
  return ORDEM.find((k) => PLANOS[k].recursos.includes(recurso)) || null;
}

/** Valor cobrado no ciclo ('mensal' | 'anual'): plano + adicionais ativos. */
function valorAssinatura(chavePlano, adicionais, ciclo = 'mensal') {
  const campo = ciclo === 'anual' ? 'anual' : 'mensal';
  return adicionaisAtivos(chavePlano, adicionais)
    .reduce((total, a) => total + ADICIONAIS[a][campo], doPlano(chavePlano)[campo]);
}

module.exports = {
  PLANOS, ORDEM, PLANO_PADRAO, ADICIONAIS,
  doPlano, adicionaisAtivos, recursosDe, temRecurso, planoMinimo, valorAssinatura,
};
