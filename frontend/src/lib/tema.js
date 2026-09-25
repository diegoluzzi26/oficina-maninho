import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * Tema claro/escuro do app. Persistido em localStorage e aplicado como
 * `data-tema` no <html> — o CSS faz o resto via seletor [data-tema="escuro"].
 *
 * O valor inicial já é lido no index.html (script inline) pra não piscar
 * branco antes do React montar; aqui só mantemos em sincronia.
 */

const CHAVE = 'ui_tema';

function temaInicial() {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch { /* ignore */ }
  // Sem preferência salva, segue o sistema operacional.
  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'escuro';
  } catch { /* ignore */ }
  return 'claro';
}

export function useTema() {
  const [tema, setTema] = useState(temaInicial);

  useEffect(() => {
    try { localStorage.setItem(CHAVE, tema); } catch { /* ignore */ }
    document.documentElement.dataset.tema = tema;
  }, [tema]);

  const alternar = () => setTema((t) => (t === 'escuro' ? 'claro' : 'escuro'));
  return { tema, setTema, alternar };
}

/** Botão de alternância — pensado pra rodapé da sidebar (fundo escuro). */
export function ToggleTema({ tema, alternar, className = '' }) {
  const escuro = tema === 'escuro';
  return (
    <button onClick={alternar}
      title={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      aria-label={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      className={`inline-flex items-center gap-2 rounded border border-white/20 px-3 py-1.5
                  font-display text-[11px] font-medium uppercase tracking-[.1em]
                  text-white/80 transition hover:border-white/40 hover:bg-white/5
                  hover:text-white ${className}`}>
      {escuro ? <Sun size={14} /> : <Moon size={14} />}
      {escuro ? 'Tema claro' : 'Tema escuro'}
    </button>
  );
}
