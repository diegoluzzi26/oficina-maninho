const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'maninho_token';
const USER_KEY = 'maninho_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
};
export function setSession(token, usuario) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Erro com status, para a UI distinguir 401 de 422. */
export class ApiError extends Error {
  constructor(message, status, detalhes) {
    super(message);
    this.status = status;
    this.detalhes = detalhes;
  }
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }

  const token = getToken();
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // Sessão expirada: limpa e volta pro login em vez de deixar a tela quebrada
  if (res.status === 401 && !path.includes('/auth/login')) {
    clearSession();
    if (!window.location.hash.includes('/login')) window.location.hash = '#/login';
    throw new ApiError('Sessão expirada. Entre novamente.', 401);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.detalhes?.length
      ? `${data.erro}: ${data.detalhes.map((d) => `${d.campo} — ${d.erro}`).join('; ')}`
      : data.erro || `Erro ${res.status}`;
    throw new ApiError(msg, res.status, data.detalhes);
  }
  return data;
}

export const api = {
  login: (email, senha) => request('/auth/login', { method: 'POST', body: { email, senha } }),

  dashboard: (params) => request('/relatorios/dashboard', { params }),
  faturamentoSemanal: (params) => request('/relatorios/faturamento/semanal', { params }),

  clientes: (params) => request('/clientes', { params }),
  cliente: (id) => request(`/clientes/${id}`),
  criarCliente: (body) => request('/clientes', { method: 'POST', body }),
  atualizarCliente: (id, body) => request(`/clientes/${id}`, { method: 'PUT', body }),

  carros: (params) => request('/carros', { params }),
  carro: (id) => request(`/carros/${id}`),
  historicoCarro: (id) => request(`/carros/${id}/historico`),
  criarCarro: (body) => request('/carros', { method: 'POST', body }),

  servicos: () => request('/servicos'),
  criarServico: (body) => request('/servicos', { method: 'POST', body }),
  desativarServico: (id) => request(`/servicos/${id}`, { method: 'DELETE' }),

  pecas: () => request('/pecas'),
  atualizarPeca: (id, body) => request(`/pecas/${id}`, { method: 'PUT', body }),
  desativarPeca: (id) => request(`/pecas/${id}`, { method: 'DELETE' }),

  ordens: (params) => request('/os', { params }),
  ordem: (id) => request(`/os/${id}`),
  criarOS: (body) => request('/os', { method: 'POST', body }),
  mudarStatus: (id, status, notificar = false, pagamento = null) =>
    request(`/os/${id}/status`, { method: 'PATCH',
      body: { status, notificar_whatsapp: notificar, ...(pagamento || {}) } }),
  atualizarOS: (id, body) => request(`/os/${id}`, { method: 'PUT', body }),
  excluirOS: (id) => request(`/os/${id}`, { method: 'DELETE' }),
  addServicoOS: (id, body) => request(`/os/${id}/servicos`, { method: 'POST', body }),
  addPecaOS: (id, body) => request(`/os/${id}/pecas`, { method: 'POST', body }),
  removerServicoOS: (id, itemId) => request(`/os/${id}/servicos/${itemId}`, { method: 'DELETE' }),
  removerPecaOS: (id, itemId) => request(`/os/${id}/pecas/${itemId}`, { method: 'DELETE' }),

  mensagensWA: (params) => request('/whatsapp/mensagens', { params }),

  // --- financeiro ---
  despesas: (params) => request('/despesas', { params }),
  boletos: (params) => request('/despesas/boletos', { params }),
  despesa: (id) => request(`/despesas/${id}`),
  criarDespesa: (body) => request('/despesas', { method: 'POST', body }),
  atualizarDespesa: (id, body) => request(`/despesas/${id}`, { method: 'PUT', body }),
  pagarDespesa: (id, body = {}) => request(`/despesas/${id}/pagar`, { method: 'PATCH', body }),
  cancelarDespesa: (id) => request(`/despesas/${id}`, { method: 'DELETE' }),

  alertas: (dias = 7) => request('/despesas/alertas', { params: { dias } }),
  enviarAlertas: () => request('/despesas/alertas/enviar', { method: 'POST', body: {} }),

  fornecedores: (params) => request('/fornecedores', { params }),
  fornecedor: (id) => request(`/fornecedores/${id}`),
  criarFornecedor: (body) => request('/fornecedores', { method: 'POST', body }),
  atualizarFornecedor: (id, body) => request(`/fornecedores/${id}`, { method: 'PUT', body }),

  painelFinanceiro: (params) => request('/financeiro/painel', { params }),
  fluxoCaixa: (params) => request('/financeiro/fluxo-caixa', { params }),
  categorias: () => request('/financeiro/categorias'),

  // --- painel do mês ---
  painelMes: (params) => request('/relatorios/painel-mes', { params }),

  // --- retornos ---
  retornos: (params) => request('/retornos', { params }),
  retornosDoMes: (params) => request('/retornos/do-mes', { params }),
  criarRetorno: (body) => request('/retornos', { method: 'POST', body }),
  atualizarRetorno: (id, body) => request(`/retornos/${id}`, { method: 'PUT', body }),
  marcarRetornoContatado: (id) => request(`/retornos/${id}/contatado`, { method: 'PATCH', body: {} }),
  enviarWhatsAppRetorno: (id) => request(`/retornos/${id}/whatsapp`, { method: 'POST', body: {} }),
  ignorarRetorno: (id) => request(`/retornos/${id}/ignorar`, { method: 'PATCH', body: {} }),
  removerRetorno: (id) => request(`/retornos/${id}`, { method: 'DELETE' }),

  // --- atualizar servico (edição inline no catálogo) ---
  atualizarServico: (id, body) => request(`/servicos/${id}`, { method: 'PUT', body }),

  // --- agendamentos ---
  agendamentos: (params) => request('/agendamentos', { params }),
  agendamentosDoDia: (data, status) => request('/agendamentos/dia', { params: { data, status } }),
  agendamento: (id) => request(`/agendamentos/${id}`),
  criarAgendamento: (body) => request('/agendamentos', { method: 'POST', body }),
  atualizarAgendamento: (id, body) => request(`/agendamentos/${id}`, { method: 'PUT', body }),
  cancelarAgendamento: (id) => request(`/agendamentos/${id}/cancelar`, { method: 'PATCH', body: {} }),
  removerAgendamento: (id) => request(`/agendamentos/${id}`, { method: 'DELETE' }),
  converterAgendamentoEmOS: (id, body = {}) =>
    request(`/agendamentos/${id}/converter-os`, { method: 'POST', body }),

  // --- configurações (só admin) ---
  configWhatsApp: () => request('/config/whatsapp'),
  salvarConfigWhatsApp: (body) => request('/config/whatsapp', { method: 'PUT', body }),

  // --- Evolution: conexão do WhatsApp ---
  waConexao: () => request('/whatsapp/conexao'),
  waQrCode: () => request('/whatsapp/conexao/qrcode', { method: 'POST', body: {} }),
  waDesconectar: () => request('/whatsapp/conexao/desconectar', { method: 'POST', body: {} }),

  // --- anexos ---
  anexosDaOS: (osId) => request(`/os/${osId}/anexos`),
  removerAnexo: (id) => request(`/anexos/${id}`, { method: 'DELETE' }),
  // Upload é multipart — não passa pelo helper `request` (que serializa JSON).
  async enviarAnexoOS(osId, arquivo, descricao) {
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    if (descricao) fd.append('descricao', descricao);
    const token = getToken();
    const res = await fetch(`${BASE}/os/${osId}/anexos`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.erro || `Erro ${res.status}`, res.status, data.detalhes);
    return data;
  },
  urlDoAnexo: (id) => `${BASE}/anexos/${id}`,
};
