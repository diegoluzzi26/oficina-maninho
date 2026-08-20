import { useEffect, useState } from 'react';

/**
 * Tamanho preferido do usuário pros painéis com muitos números e gráficos.
 * Persistido em localStorage — vale pra Painel e Financeiro juntos.
 *
 *   compacto  — cabem mais coisas na tela; bom pra desktop com muita OS
 *   normal    — default
 *   grande    — números e gráficos maiores; bom pra distância / olho cansado
 */

const CHAVE = 'ui_densidade';

const PRESETS = {
  compacto: {
    kpiValor:      'text-[22px]',
    kpiPad:        'p-3',
    graficoAlto:   220,
    graficoMedio:  180,
    graficoPeq:    140,
  },
  normal: {
    kpiValor:      'text-[32px]',
    kpiPad:        'p-5',
    graficoAlto:   300,
    graficoMedio:  220,
    graficoPeq:    180,
  },
  grande: {
    kpiValor:      'text-[42px]',
    kpiPad:        'p-6',
    graficoAlto:   400,
    graficoMedio:  300,
    graficoPeq:    240,
  },
};

export function useDensidade() {
  const [densidade, setDensidadeRaw] = useState(() => {
    try { return localStorage.getItem(CHAVE) || 'normal'; }
    catch { return 'normal'; }
  });

  useEffect(() => {
    try { localStorage.setItem(CHAVE, densidade); } catch { /* ignore */ }
  }, [densidade]);

  const preset = PRESETS[densidade] || PRESETS.normal;
  return { densidade, setDensidade: setDensidadeRaw, preset };
}

/** Toggle visual pra colocar no topo das telas de Painel/Financeiro. */
export function ToggleDensidade({ densidade, setDensidade }) {
  const opcoes = [
    ['compacto', '𝒂 Compacto'],
    ['normal',   '𝑨 Normal'],
    ['grande',   '𝑨𝑨 Grande'],
  ];
  return (
    <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
      {opcoes.map(([k, label]) => (
        <button key={k} onClick={() => setDensidade(k)}
          title={`Tamanho ${k}`}
          className={`rounded px-2.5 py-1 text-[11px] font-semibold transition
            ${densidade === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
