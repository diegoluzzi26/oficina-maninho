import { getUser } from './api';

/**
 * Helpers de gating baseados no papel do usuário logado.
 *
 * Regra atual: papel 'basico' (Maninho / mecânico) não pode apagar
 * nem cancelar nada. Admin e atendente permanecem inalterados.
 *
 * Os componentes chamam sem argumento (pega do localStorage via
 * getUser). Passar `u` explícito é útil em testes.
 */

export const podeExcluir  = (u = getUser()) => u?.role !== 'basico';
export const podeCancelar = (u = getUser()) => u?.role !== 'basico';
