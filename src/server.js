const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./config');
const connectDB = require('./config/database');
const paymentMonitor = require('./jobs/paymentMonitor');
const retryService = require('./services/retryService');
const { globalLimiter } = require('./middleware/rateLimiter');

// Routes
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');

const app = express();

// ===== MIDDLEWARE =====
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(globalLimiter);

// ===== API ROUTES =====
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/internal', webhookRoutes);

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    network: config.tron.network,
    activeRetries: retryService.activeCount,
  });
});

// ===== DASHBOARD REACT (en production) =====
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '../dashboard/build')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../dashboard/build', 'index.html'));
    }
  });
}

// ===== DÉMARRAGE =====
async function start() {
  await connectDB();

  app.listen(config.port, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║       🪙 CRYPTO PAY API - USDT TRC-20         ║
╠═══════════════════════════════════════════════╣
║  Port       : ${String(config.port).padEnd(31)}║
║  Réseau     : ${String(config.tron.network).padEnd(31)}║
║  Env        : ${String(config.nodeEnv).padEnd(31)}║
║  Expiration : ${String(config.payment.expirationMinutes + ' min').padEnd(31)}║
║  Chiffrement: ${String(config.encryption.masterKey ? '✅ AES-256-GCM' : '⚠️  DÉSACTIVÉ').padEnd(31)}║
║  Rate limit : ${String('✅ Activé').padEnd(31)}║
╚═══════════════════════════════════════════════╝
    `);
  });

  paymentMonitor.start();
}

start().catch((err) => {
  console.error('❌ Erreur au démarrage:', err);
  process.exit(1);
});

// Graceful shutdown
function shutdown() {
  console.log('🛑 Arrêt en cours...');
  paymentMonitor.stop();
  retryService.cancelAll();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
