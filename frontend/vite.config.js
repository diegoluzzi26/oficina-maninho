import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Versão = major.minor do package.json + número do build (quantidade de
// commits do HEAD). Cada deploy com commit novo ganha um número novo:
// v1.1.182, v1.1.183... No container web o .git não existe, então o
// deploy/deploy.sh passa APP_BUILD/APP_COMMIT como build args. Em dev
// local lê direto do git. Sem nenhum dos dois, usa o package.json puro.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const build = process.env.APP_BUILD || git('rev-list --count HEAD');
const commit = process.env.APP_COMMIT || git('rev-parse --short HEAD');
const [major, minor] = pkg.version.split('.');
const versao = /^\d+$/.test(build) ? `${major}.${minor}.${build}` : pkg.version;

export default defineConfig({
  plugins: [react()],
  // O sistema mora em /app/ no mesmo domínio da landing (gestaotorque.com.br).
  base: '/app/',
  define: {
    __APP_VERSION__: JSON.stringify(versao),
    __APP_COMMIT__: JSON.stringify(commit),
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
