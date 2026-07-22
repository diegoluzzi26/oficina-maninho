/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Azul extraído do vetor Logo_Maninho.pdf (#283090 = 13% dos pixels)
        maninho: {
          50:  '#eef0fa',
          100: '#dadef4',
          200: '#b4bce8',
          300: '#8b96d9',
          400: '#5c6bc4',
          500: '#3a48a8',
          600: '#283090',   // COR DA MARCA
          700: '#222878',
          800: '#1a1f5e',
          900: '#141748',
          950: '#0b0d2b',
        },
        // Preto do painel da fachada
        painel: {
          800: '#1c1c22',
          900: '#131318',
          950: '#0a0a0d',
        },
        ouro: {
          100: '#faf1dc',
          300: '#e8c97e',
          500: '#D4A843',
          600: '#b8902f',
          700: '#8f6f22',
        },
      },
      fontFamily: {
        // Script do letreiro — usada só na marca, nunca em texto corrido
        marca: ['"Parisienne"', 'cursive'],
        // Condensada industrial para títulos e números: cara de oficina
        display: ['"Oswald"', 'Impact', 'sans-serif'],
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,23,72,.05), 0 4px 14px -6px rgba(20,23,72,.12)',
        lift: '0 2px 6px rgba(20,23,72,.10), 0 16px 32px -12px rgba(20,23,72,.25)',
        painel: '0 2px 0 0 #D4A843',
      },
      backgroundImage: {
        // Faixa diagonal do arco do logo, usada em cabeçalhos
        'arco': 'linear-gradient(100deg, #283090 0%, #1a1f5e 55%, #131318 100%)',
      },
    },
  },
  plugins: [],
};
