export const brl = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(v || 0));

/** Compacto para eixos de gráfico: 12500 -> "12,5 mil" */
export const brlCurto = (v) => {
  const n = Number(v || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} mil`;
  return String(n).replace('.', ',');
};

export const data = (d) =>
  (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

export const dataHora = (d) =>
  (d ? new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  }) : '—');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const nomeMes = (m) => MESES_LONGOS[m - 1];

export const mesCurto = (iso) => {
  const d = new Date(iso);
  return `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`;
};

export const semanaCurta = (iso) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const telefone = (e164) => {
  const m = String(e164 || '').match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 || '—');
};

export const STATUS = {
  aberta: { texto: 'Aberta', classe: 'bg-slate-100 text-slate-700 ring-slate-300' },
  em_andamento: { texto: 'Em andamento', classe: 'bg-ouro-100 text-ouro-700 ring-ouro-300' },
  finalizada: { texto: 'Finalizada', classe: 'bg-marca-100 text-marca-800 ring-marca-200' },
  paga: { texto: 'Paga', classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
};

/** Primeiro e último dia de um mês relativo ao atual, em AAAA-MM-DD. */
export function periodoMeses(mesesAtras) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras + 1, 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(hoje) };
}

export const STATUS_DESPESA = {
  pendente:  { texto: 'Pendente',  classe: 'bg-slate-100 text-slate-700 ring-slate-300' },
  paga:      { texto: 'Paga',      classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  atrasada:  { texto: 'Atrasada',  classe: 'bg-rose-50 text-rose-700 ring-rose-300' },
  cancelada: { texto: 'Cancelada', classe: 'bg-slate-50 text-slate-400 ring-slate-200' },
};

export const FORMAS_PAGAMENTO = [
  { valor: 'boleto',         rotulo: 'Boleto' },
  { valor: 'pix',            rotulo: 'PIX' },
  { valor: 'dinheiro',       rotulo: 'Dinheiro' },
  { valor: 'cartao_credito', rotulo: 'Cartão de crédito' },
  { valor: 'cartao_debito',  rotulo: 'Cartão de débito' },
  { valor: 'transferencia',  rotulo: 'Transferência' },
  { valor: 'cheque',         rotulo: 'Cheque' },
  { valor: 'outro',          rotulo: 'Outro' },
];

export const rotuloForma = (f) =>
  FORMAS_PAGAMENTO.find((x) => x.valor === f)?.rotulo || f;

/** Texto curto de vencimento: "vence em 3 dias", "atrasado há 2 dias", "hoje". */
export function textoVencimento(dias) {
  if (dias === null || dias === undefined) return null;
  if (dias < 0) return `atrasado há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`;
  if (dias === 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  return `vence em ${dias} dias`;
}

/** Data no formato AAAA-MM-DD para inputs type="date". */
export const paraInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const hojeISO = () => new Date().toISOString().slice(0, 10);

/**
 * Normaliza um nome de peça/serviço para agrupar sinônimos triviais:
 * ignora caixa, acentos e plural simples. Ex.: "Bieletas", "bieleta"
 * e "BIELETA " colapsam na mesma chave.
 * Não resolve sinônimos semânticos (ex.: "amortecedor" ≠ "amortecedores
 * dianteiros"); só o par singular/plural + variações de grafia.
 */
export function chaveNome(nome) {
  const base = String(nome || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

/**
 * Agrupa itens de peças/serviços por nome normalizado (chaveNome),
 * somando quantidade e valor. Preserva a data mais recente e a
 * grafia mais frequente como rótulo de exibição.
 *
 * `nomeCampo` é o nome do campo que contém a descrição (ex.: 'descricao'
 * para peças, 'nome_servico' para serviços).
 */
export function agruparPorSinonimo(itens, nomeCampo) {
  const grupos = new Map();
  for (const it of itens || []) {
    const nome = it[nomeCampo] || '';
    const chave = chaveNome(nome);
    if (!chave) continue;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        chave,
        nomes: {},
        quantidade: 0,
        valor_total: 0,
        ocorrencias: 0,
        ultima_em: null,
        ultima_numero_os: null,
      };
      grupos.set(chave, g);
    }
    g.nomes[nome] = (g.nomes[nome] || 0) + 1;
    g.quantidade += Number(it.quantidade) || 0;
    g.valor_total += Number(it.valor_total) || 0;
    g.ocorrencias += 1;
    const dt = it.aberta_em ? new Date(it.aberta_em).getTime() : 0;
    const prev = g.ultima_em ? new Date(g.ultima_em).getTime() : 0;
    if (dt >= prev) { g.ultima_em = it.aberta_em; g.ultima_numero_os = it.numero_os; }
  }
  return Array.from(grupos.values())
    .map((g) => ({
      ...g,
      nome_exibicao: Object.entries(g.nomes)
        .sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => (new Date(b.ultima_em) - new Date(a.ultima_em)));
}
