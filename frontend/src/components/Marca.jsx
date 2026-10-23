/**
 * Marca da plataforma — Gestão Torque.
 *
 * Símbolo vórtice: três trilhas representam o fluxo de uma oficina inteira.
 * O desenho é 100% SVG inline, então escala
 * perfeito e acompanha o tema sem depender de arquivo externo.
 *
 * Exports mantêm os nomes antigos (Marca, MarcaCompacta, Arco, Selo) pra Login
 * e Layout continuarem importando igual.
 */

/** Símbolo do Gestão Torque. Props preservadas para compatibilidade interna. */
export function Engrenagem({ className = 'h-8 w-8', engrenagem = '#1f1a24', h = '#ff5a36' }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <path d="M60 10c27.6 0 50 22.4 50 50H82c0-12.2-9.8-22-22-22V10Z" fill={h} />
      <path d="M110 60c0 27.6-22.4 50-50 50V82c12.2 0 22-9.8 22-22h28Z" fill="#6e44ff" />
      <path d="M60 110c-27.6 0-50-22.4-50-50h28c0 12.2 9.8 22 22 22v28Z" fill={engrenagem} />
      <circle cx="60" cy="60" r="10" fill="#fff4ea" />
    </svg>
  );
}

/** Nome da marca na assinatura horizontal. */
function Wordmark({ claro, className = '' }) {
  return (
    <span className={`inline-flex items-baseline gap-[.28em] whitespace-nowrap font-marca leading-none tracking-[-.055em] ${className}`}>
      <span className={claro ? 'font-bold text-white' : 'font-bold text-painel-900'}>Gestão</span>
      <span className={claro ? 'font-extrabold text-[#ff8068]' : 'font-extrabold text-marca-600'}>Torque</span>
    </span>
  );
}

/**
 * Assinatura: símbolo + wordmark.
 * `variante="claro"` = fundo escuro (sidebar); `"escuro"` = fundo claro.
 */
export function Marca({ variante = 'claro', tamanho = 'md' }) {
  const claro = variante === 'claro';
  const simbolo = { sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-16 w-16' }[tamanho];
  const texto   = { sm: 'text-[19px]', md: 'text-[26px]', lg: 'text-[38px]' }[tamanho];
  return (
    <div className="flex items-center gap-2.5">
      <Engrenagem
        className={`${simbolo} shrink-0`}
        engrenagem={claro ? '#ffffff' : '#1f1a24'}
      />
      <Wordmark claro={claro} className={texto} />
    </div>
  );
}

/** Versão compacta para navegação. */
export function MarcaCompacta() {
  return (
    <div className="flex items-center gap-2">
      <Engrenagem className="h-8 w-8 shrink-0" engrenagem="#ffffff" />
      <Wordmark claro className="text-[17px]" />
    </div>
  );
}

/** Marca d'água grande para os fundos. */
export function Arco({ className = 'h-7 w-auto', claro = false }) {
  return (
    <Engrenagem
      className={className}
      engrenagem={claro ? '#ffffff' : '#1f1a24'}
      h={claro ? '#ffffff' : '#1f1a24'}
    />
  );
}

/** Selo compacto (só o símbolo), mantido por compatibilidade. */
export function Selo({ className = 'h-11 w-11', claro = false }) {
  return <Engrenagem className={className} engrenagem={claro ? '#ffffff' : '#1f1a24'} />;
}
