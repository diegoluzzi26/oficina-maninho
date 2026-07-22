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
