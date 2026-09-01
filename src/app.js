'use strict';
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const auth = require('./middleware/auth');
const oficinaContext = require('./middleware/oficinaContext');
const bloquearBasico = require('./middleware/bloquearExclusoesBasico');
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

// Lista pública de oficinas (só o dropdown do login)
app.use('/api/oficinas', require('./routes/oficinas.routes'));

// Daqui pra baixo, tudo exige token. bloquearBasico proíbe exclusões
// pro papel 'basico' — não afeta admin nem atendente.
app.use('/api/clientes',   auth, oficinaContext, bloquearBasico, require('./routes/clientes.routes'));
app.use('/api/carros',     auth, oficinaContext, bloquearBasico, require('./routes/carros.routes'));
app.use('/api/servicos',   auth, oficinaContext, bloquearBasico, require('./routes/servicos.routes'));
app.use('/api/pecas',      auth, oficinaContext, bloquearBasico, require('./routes/pecas.routes'));
app.use('/api/funcionarios', auth, oficinaContext, bloquearBasico, require('./routes/funcionarios.routes'));
app.use('/api/despesas-recorrentes', auth, oficinaContext, bloquearBasico, require('./routes/despesas-recorrentes.routes'));
app.use('/api/os',         auth, oficinaContext, bloquearBasico, require('./routes/os.routes'));
app.use('/api/relatorios', auth, oficinaContext, bloquearBasico, require('./routes/relatorios.routes'));
app.use('/api/despesas',     auth, oficinaContext, bloquearBasico, require('./routes/despesas.routes'));
app.use('/api/fornecedores', auth, oficinaContext, bloquearBasico, require('./routes/fornecedores.routes'));
app.use('/api/financeiro',   auth, oficinaContext, bloquearBasico, require('./routes/financeiro.routes'));
app.use('/api/retornos',     auth, oficinaContext, bloquearBasico, require('./routes/retornos.routes'));
app.use('/api/agendamentos', auth, oficinaContext, bloquearBasico, require('./routes/agendamentos.routes'));
app.use('/api/followup',     auth, oficinaContext, bloquearBasico, require('./routes/followup.routes'));
app.use('/api/config',       auth, oficinaContext, bloquearBasico, require('./routes/config.routes'));
// anexos.routes expõe /os/:id/anexos E /anexos/:id no mesmo router
app.use('/api',              auth, oficinaContext, bloquearBasico, require('./routes/anexos.routes'));

app.use((req, _res, next) => next(new AppError(`Rota não encontrada: ${req.method} ${req.path}`, 404)));
app.use(errorHandler);

module.exports = app;
