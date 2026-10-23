'use strict';

/**
 * Permissões por usuário — o admin da oficina escolhe, em Equipe, quais
 * módulos cada pessoa enxerga. Fonte única das chaves (o frontend recebe a
 * lista pronta em GET /api/auth/permissoes).
 *
 * users.permissoes NULL = padrão do papel (PADRAO_POR_PAPEL). Admin sempre
 * tem tudo: não dá pra uma oficina ficar sem ninguém que gerencie.
 *
 * Telas só de admin (DRE, Pessoal, Funcionários, Recorrentes, Equipe, Plano,
 * Config) não entram aqui: continuam presas ao papel admin.
 */
const MODULOS = [
  { chave: 'painel',     nome: 'Painel',               descricao: 'Resumo do mês, faturamento e gráficos' },
  { chave: 'agenda',     nome: 'Agenda',               descricao: 'Horários marcados' },
  { chave: 'ordens',     nome: 'Ordens de serviço',    descricao: 'Kanban, orçamentos e OS' },
  { chave: 'clientes',   nome: 'Clientes',             descricao: 'Cadastro de clientes e veículos' },
  { chave: 'financeiro', nome: 'Financeiro',           descricao: 'Caixa do dia e do mês' },
  { chave: 'despesas',   nome: 'Despesas',             descricao: 'Contas a pagar e fornecedores' },
  { chave: 'retornos',   nome: 'Retornos',             descricao: 'Clientes pra chamar de volta' },
  { chave: 'followup',   nome: 'Follow-up',            descricao: 'Lembretes de revisão no WhatsApp' },
  { chave: 'catalogo',   nome: 'Catálogo',             descricao: 'Serviços e peças' },
  { chave: 'excluir',    nome: 'Excluir e cancelar',   descricao: 'Apagar registros e cancelar agendamentos' },
];

const TODAS = MODULOS.map((m) => m.chave);

const PADRAO_POR_PAPEL = {
  admin: TODAS,
  atendente: TODAS,
  basico: ['agenda', 'ordens'],
};

/** Permissões que valem pro usuário (linha de public.users). */
function efetivas({ role, permissoes, super_admin: superAdmin }) {
  if (superAdmin || role === 'admin') return TODAS;
  if (Array.isArray(permissoes)) return permissoes.filter((p) => TODAS.includes(p));
  return PADRAO_POR_PAPEL[role] || [];
}

module.exports = { MODULOS, TODAS, PADRAO_POR_PAPEL, efetivas };
