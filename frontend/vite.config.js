import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
