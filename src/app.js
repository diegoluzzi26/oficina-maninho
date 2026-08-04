'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const auth = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

app.use(helmet());

/**
 * CORS restrito por whitelist quando CORS_ORIGINS está setado.
 * Em dev (sem a var), aceita qualquer origem pra facilitar teste local.
 * Em prod (frontend hospedado à parte, ex: Vercel), listar cada origem
 * separada por vírgula: "https://oficina.vercel.app,https://sistema.dominio.com"
 * Também aceita padrão *.vercel.app (previews de PR).
 */
const origensPermitidas = (process.env.CORS_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origensPermitidas.length) return cb(null, true); // dev
    if (!origin) return cb(null, true); // curl, mobile apps, mesmo origem
    const ok = origensPermitidas.some((o) => {
      if (o === '*') return true;
      if (o.startsWith('*.')) return origin.endsWith(o.slice(1));
      return o === origin;
    });
    cb(ok ? null : new Error(`Origem não permitida: ${origin}`), ok);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// WhatsApp entra primeiro: o webhook não pode exigir JWT.
app.use('/api/whatsapp', require('./routes/whatsapp.routes'));

// Login é público
app.use('/api/auth', require('./routes/auth.routes'));

// Daqui pra baixo, tudo exige token
app.use('/api/clientes',   auth, require('./routes/clientes.routes'));
app.use('/api/carros',     auth, require('./routes/carros.routes'));
app.use('/api/servicos',   auth, require('./routes/servicos.routes'));
app.use('/api/pecas',      auth, require('./routes/pecas.routes'));
app.use('/api/funcionarios', auth, require('./routes/funcionarios.routes'));
app.use('/api/despesas-recorrentes', auth, require('./routes/despesas-recorrentes.routes'));
app.use('/api/os',         auth, require('./routes/os.routes'));
app.use('/api/relatorios', auth, require('./routes/relatorios.routes'));
app.use('/api/despesas',     auth, require('./routes/despesas.routes'));
app.use('/api/fornecedores', auth, require('./routes/fornecedores.routes'));
app.use('/api/financeiro',   auth, require('./routes/financeiro.routes'));
app.use('/api/retornos',     auth, require('./routes/retornos.routes'));
app.use('/api/agendamentos', auth, require('./routes/agendamentos.routes'));
app.use('/api/followup',     auth, require('./routes/followup.routes'));
app.use('/api/config',       auth, require('./routes/config.routes'));
// anexos.routes expõe /os/:id/anexos E /anexos/:id no mesmo router
app.use('/api',              auth, require('./routes/anexos.routes'));

app.use((req, _res, next) => next(new AppError(`Rota não encontrada: ${req.method} ${req.path}`, 404)));
app.use(errorHandler);

module.exports = app;
