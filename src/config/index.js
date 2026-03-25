require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/crypto-pay',
  },

  tron: {
    fullHost: process.env.TRON_FULL_HOST || 'https://api.shasta.trongrid.io',
    apiKey: process.env.TRONGRID_API_KEY,
    network: process.env.TRON_NETWORK || 'shasta',
    usdtContract: process.env.USDT_CONTRACT_ADDRESS,
    centralWallet: {
      address: process.env.CENTRAL_WALLET_ADDRESS,
      privateKey: process.env.CENTRAL_WALLET_PRIVATE_KEY,
    },
  },

  payment: {
    expirationMinutes: parseInt(process.env.PAYMENT_EXPIRATION_MINUTES) || 15,
    checkIntervalSeconds: parseInt(process.env.PAYMENT_CHECK_INTERVAL_SECONDS) || 10,
  },

  webhook: {
    internalUrl: process.env.WEBHOOK_INTERNAL_URL,
    secret: process.env.WEBHOOK_SECRET,
  },

  sweep: {
    minTrxForGas: parseInt(process.env.SWEEP_MIN_TRX_FOR_GAS) || 15000000,
    feeLimit: parseInt(process.env.SWEEP_FEE_LIMIT) || 30000000,
  },

  admin: {
    apiKey: process.env.ADMIN_API_KEY,
    password: process.env.ADMIN_PASSWORD || 'changeme',
    secret: process.env.ADMIN_TOKEN_SECRET || process.env.WEBHOOK_SECRET || 'dev-secret',
  },

  encryption: {
    masterKey: process.env.ENCRYPTION_KEY,
  },
};
