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
app.use(cors());
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
app.use('/api/os',         auth, require('./routes/os.routes'));
app.use('/api/relatorios', auth, require('./routes/relatorios.routes'));
app.use('/api/despesas',     auth, require('./routes/despesas.routes'));
app.use('/api/fornecedores', auth, require('./routes/fornecedores.routes'));
app.use('/api/financeiro',   auth, require('./routes/financeiro.routes'));
app.use('/api/retornos',     auth, require('./routes/retornos.routes'));
app.use('/api/agendamentos', auth, require('./routes/agendamentos.routes'));

app.use((req, _res, next) => next(new AppError(`Rota não encontrada: ${req.method} ${req.path}`, 404)));
app.use(errorHandler);

module.exports = app;
