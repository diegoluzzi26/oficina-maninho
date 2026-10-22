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

// Plataforma (super-admin): provisiona oficinas. Sem oficinaContext —
// opera sobre o public e cria schemas novos.
const requireSuperAdmin = require('./middleware/requireSuperAdmin');
app.use('/api/admin', auth, requireSuperAdmin, require('./routes/admin.routes'));

// Status da assinatura e do contrato da própria oficina. Ficam FORA do
// enforcement pra o front ler/aceitar mesmo quando bloqueado/pendente.
app.use('/api/assinatura', auth, oficinaContext, require('./routes/assinatura.routes'));
app.use('/api/contrato',   auth, oficinaContext, require('./routes/contrato.routes'));

// Daqui pra baixo, tudo exige token, assinatura em dia E contrato aceito.
// Ordem: auth → contexto → assinatura (402) → contrato (403) → bloquearBasico.
const exigirAssinatura = require('./middleware/exigirAssinatura');
const exigirContrato = require('./middleware/exigirContrato');
const protegido = [auth, oficinaContext, exigirAssinatura, exigirContrato, bloquearBasico];

app.use('/api/clientes',   ...protegido, require('./routes/clientes.routes'));
app.use('/api/carros',     ...protegido, require('./routes/carros.routes'));
app.use('/api/servicos',   ...protegido, require('./routes/servicos.routes'));
app.use('/api/pecas',      ...protegido, require('./routes/pecas.routes'));
app.use('/api/funcionarios', ...protegido, require('./routes/funcionarios.routes'));
app.use('/api/despesas-recorrentes', ...protegido, require('./routes/despesas-recorrentes.routes'));
app.use('/api/os',         ...protegido, require('./routes/os.routes'));
app.use('/api/etapas',     ...protegido, require('./routes/etapas.routes'));
app.use('/api/relatorios', ...protegido, require('./routes/relatorios.routes'));
app.use('/api/despesas',     ...protegido, require('./routes/despesas.routes'));
app.use('/api/fornecedores', ...protegido, require('./routes/fornecedores.routes'));
app.use('/api/financeiro',   ...protegido, require('./routes/financeiro.routes'));
app.use('/api/retornos',     ...protegido, require('./routes/retornos.routes'));
app.use('/api/agendamentos', ...protegido, require('./routes/agendamentos.routes'));
app.use('/api/followup',     ...protegido, require('./routes/followup.routes'));
app.use('/api/ia',           ...protegido, require('./routes/ia.routes'));
app.use('/api/config',       ...protegido, require('./routes/config.routes'));
// anexos.routes expõe /os/:id/anexos E /anexos/:id no mesmo router
app.use('/api',              ...protegido, require('./routes/anexos.routes'));

app.use((req, _res, next) => next(new AppError(`Rota não encontrada: ${req.method} ${req.path}`, 404)));
app.use(errorHandler);

module.exports = app;
