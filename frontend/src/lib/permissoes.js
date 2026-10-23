import { getUser } from './api';

/**
 * Permissões do usuário logado (módulos liberados pelo admin da oficina em
 * Equipe; chaves em src/config/permissoes.js do backend).
 *
 * `u.permissoes` vem no login e é atualizado pelo Layout a cada carga
 * (GET /auth/permissoes). Sessão antiga sem a lista cai na regra do papel:
 * 'basico' só vê Agenda e Ordens e não apaga nada.
 *
 * Os componentes chamam sem argumento (pega do localStorage via getUser).
 * Passar `u` explícito é útil em testes.
 */

export function temPermissao(chave, u = getUser()) {
  if (!u) return false;
  if (u.role === 'admin' || u.super_admin) return true;
  if (Array.isArray(u.permissoes)) return u.permissoes.includes(chave);
  return u.role !== 'basico' || ['agenda', 'ordens'].includes(chave);
}

export const podeExcluir  = (u = getUser()) => temPermissao('excluir', u);
export const podeCancelar = (u = getUser()) => temPermissao('excluir', u);

/** Módulo de cada tela (rota) do menu. Rota fora daqui não tem trava por módulo. */
export const MODULO_DA_ROTA = {
  '/': 'painel',
  '/agenda': 'agenda',
  '/ordens': 'ordens',
  '/clientes': 'clientes',
  '/despesas': 'despesas',
  '/fornecedores': 'despesas',
  '/financeiro': 'financeiro',
  '/retornos': 'retornos',
  '/followup': 'followup',
  '/followup/regras': 'followup',
  '/servicos': 'catalogo',
};

/** Primeira tela que o usuário pode abrir (pra quem não tem o Painel). */
export function telaInicial(u = getUser()) {
  const rota = ['/', '/ordens', '/agenda', '/clientes', '/financeiro', '/despesas',
    '/retornos', '/followup', '/servicos'].find((r) => temPermissao(MODULO_DA_ROTA[r], u));
  return rota || '/sem-acesso';
}
