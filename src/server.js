'use strict';
const app = require('./app');
const env = require('./config/env');
const { pool } = require('./config/db');

const server = app.listen(env.port, () => {
  console.log(`[api] rodando na porta ${env.port} (${env.nodeEnv})`);
  console.log(`[api] whatsapp: ${env.whatsapp.enabled ? 'configurado' : 'NÃO configurado'}`);
  require('./services/alertas.service').agendar();
});

// Encerra conexões abertas antes de morrer — evita erro no cliente durante deploy
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => {
    console.log(`\n[api] ${sinal} recebido, encerrando...`);
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
