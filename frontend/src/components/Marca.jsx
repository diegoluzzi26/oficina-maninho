/**
 * Marca da Auto Elétrica Maninho.
 *
 * A logo oficial (arco duplo + "Auto Elétrica Maninho" em script) mora em
 * /logo-maninho.svg, extraído do PDF original. As exports abaixo garantem
 * que Login e Layout continuem funcionando com as mesmas chamadas de antes.
 */

const LOGO = '/logo-maninho.svg';

/** Arco isolado (mantido pra ficar como marca d'água no fundo do Login). */
export function Arco({ className = 'h-7 w-auto', claro = false }) {
  return (
    <svg viewBox="0 0 64 30" className={className} aria-hidden="true" fill="none">
      <path d="M2 27C10 9 26 2 44 2"
        stroke={claro ? '#ffffff' : '#283090'} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M20 27C26 15 36 9 48 8"
        stroke={claro ? '#D4A843' : '#283090'} strokeOpacity={claro ? 1 : 0.55}
        strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

/** Selo "Desde 1997", igual ao da fachada. */
export function Selo({ className = 'h-11 w-11', claro = false }) {
  const cor = claro ? '#ffffff' : '#283090';
  return (
    <svg viewBox="0 0 60 60" className={className} aria-hidden="true">
      <g fill="none" stroke={cor} strokeWidth="1.4">
        <circle cx="30" cy="30" r="27" strokeDasharray="2.6 2.6" opacity=".65" />
        <circle cx="30" cy="30" r="22.5" />
      </g>
      <text x="30" y="27" textAnchor="middle"
        fontFamily="Parisienne, cursive" fontSize="13" fill={cor}>
        Desde
      </text>
      <text x="30" y="41" textAnchor="middle"
        fontFamily="Oswald, sans-serif" fontSize="14" fontWeight="600"
        letterSpacing="1" fill={cor}>
        1997
      </text>
    </svg>
  );
}

/**
 * Assinatura completa: logo oficial + selo opcional.
 * `variante="claro"` inverte a logo pra ficar visível em fundo escuro.
 */
export function Marca({ variante = 'claro', tamanho = 'md', comSelo = false }) {
  const claro = variante === 'claro';

  const alturas = { sm: 'h-10', md: 'h-16', lg: 'h-24' }[tamanho];
  const selos   = { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-14 w-14' }[tamanho];

  return (
    <div className="flex items-center gap-3">
      <img src={LOGO} alt="Auto Elétrica Maninho"
        className={`${alturas} w-auto ${claro ? 'brightness-0 invert' : ''}`} />
      {comSelo && <Selo className={`${selos} shrink-0`} claro={claro} />}
    </div>
  );
}

/** Versão compacta para a barra de navegação. */
export function MarcaCompacta() {
  return (
    <img src={LOGO} alt="Auto Elétrica Maninho"
      className="h-9 w-auto brightness-0 invert" />
  );
}
