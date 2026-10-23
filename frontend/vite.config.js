import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Versão vem do package.json; o build time é gerado a cada `npm run build`
// (inclusive dentro do container web em produção). Juntos dão um indicador
// confiável de qual versão está no ar — o SHA do git não vale aqui porque
// o .git não entra no contexto de build do Docker.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  plugins: [react()],
  // O sistema mora em /app/ no mesmo domínio da landing (gestaotorque.com.br).
  base: '/app/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // Alguns arquivos em src/lib/*.js contêm JSX (ex.: densidade.js).
  // Faz o esbuild tratar todo .js como JSX pra build não quebrar.
  esbuild: { loader: 'jsx', include: /src\/.*\.jsx?$/, exclude: [] },
  optimizeDeps: {
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
  server: {
    port: 5173,
    // Em dev, o front chama /api e o Vite repassa pro Express.
    // Evita CORS e mantém as URLs iguais em dev e produção.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Separa Recharts do resto: o navegador cacheia as libs entre deploys
        // e as telas sem gráfico não pagam o custo dele.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          graficos: ['recharts'],
        },
      },
    },
  },
});
