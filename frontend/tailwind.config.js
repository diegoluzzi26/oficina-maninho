/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ===== Gestão Torque =====
        // Roxo de movimento: uma nova pele para todas as classes de marca.
        maninho: {
          50:  '#f2efff',
          100: '#e5ddff',
          200: '#cebdff',
          300: '#b197ff',
          400: '#8b68ff',
          500: '#774ff5',
          600: '#6e44ff',
          700: '#5930dc',
          800: '#4827b1',
          900: '#3d248f',
          950: '#251653',
        },
        marca: {
          50:  '#f2efff',
          100: '#e5ddff',
          200: '#cebdff',
          300: '#b197ff',
          400: '#8b68ff',
          500: '#774ff5',
          600: '#6e44ff',
          700: '#5930dc',
          800: '#4827b1',
          900: '#3d248f',
          950: '#251653',
        },
        // Preto do painel — fundo da sidebar e topbar
        painel: {
          800: '#312a37',
          900: '#1f1a24',
          950: '#120f15',
        },
        // Coral: chama atenção para ação, prazo e avanço.
        ouro: {
          100: '#ffdfd8',
          300: '#ffac99',
          500: '#ff5a36',
          600: '#de3f21',
          700: '#b72d16',
        },
      },
      fontFamily: {
        marca: ['"Syne"', 'system-ui', 'sans-serif'],
        display: ['"Syne"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '0.625rem',   // 10px — inputs, botões
        xl: '0.875rem',   // 14px — cards
        '2xl': '1.125rem', // 18px — superfícies maiores (modal, hero)
      },
      boxShadow: {
        // Sombras tingidas do navy da marca
        card: '0 1px 2px rgba(8,24,51,.04), 0 2px 6px -2px rgba(8,24,51,.07), 0 10px 26px -14px rgba(8,24,51,.16)',
        lift: '0 2px 8px rgba(8,24,51,.08), 0 22px 44px -18px rgba(8,24,51,.26)',
        painel: '0 2px 0 0 #f97316',
        'foco-marca': '0 0 0 3px rgba(15,46,77,.20)',
      },
      backgroundImage: {
        // Faixa diagonal navy usada em cabeçalhos
        'arco': 'linear-gradient(100deg, #0f2e4d 0%, #0a1f33 55%, #0a111b 100%)',
      },
    },
  },
  plugins: [],
};
