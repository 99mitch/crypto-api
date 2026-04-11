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
    amountTolerance: parseFloat(process.env.PAYMENT_AMOUNT_TOLERANCE) || 0.015,
    gracePeriodSeconds: parseInt(process.env.PAYMENT_GRACE_PERIOD_SECONDS) || 120,
  },

  webhook: {
    internalUrl: process.env.WEBHOOK_INTERNAL_URL,
    secret: process.env.WEBHOOK_SECRET,
  },

  sweep: {
    minTrxForGas: parseInt(process.env.SWEEP_MIN_TRX_FOR_GAS) || 15000000,
    feeLimit: parseInt(process.env.SWEEP_FEE_LIMIT) || 30000000,
  },

  fees: {
    walletAddress: process.env.FEES_WALLET_ADDRESS || null,
    percentage: parseFloat(process.env.FEES_PERCENTAGE) || 0.03,
  },

  btc: {
    network: process.env.BTC_NETWORK || 'mainnet',
    blockcypherToken: process.env.BLOCKCYPHER_TOKEN || '',
    centralWallet: {
      address: process.env.BTC_CENTRAL_WALLET_ADDRESS,
      wif: process.env.BTC_CENTRAL_WALLET_WIF,
    },
    feesWalletAddress: process.env.BTC_FEES_WALLET_ADDRESS || null,
    payment: {
      expirationMinutes: parseInt(process.env.BTC_PAYMENT_EXPIRATION_MINUTES) || 60,
      requiredConfirmations: parseInt(process.env.BTC_REQUIRED_CONFIRMATIONS) || 1,
      amountTolerance: parseFloat(process.env.BTC_AMOUNT_TOLERANCE) || 0.015,
    },
  },

  eth: {
    rpcUrl: process.env.ETH_RPC_URL || 'https://cloudflare-eth.com',
    etherscanApiKey: process.env.ETHERSCAN_API_KEY || '',
    centralWallet: {
      address: process.env.ETH_CENTRAL_WALLET_ADDRESS,
    },
    feesWalletAddress: process.env.ETH_FEES_WALLET_ADDRESS || null,
    payment: {
      expirationMinutes: parseInt(process.env.ETH_PAYMENT_EXPIRATION_MINUTES) || 60,
      requiredConfirmations: parseInt(process.env.ETH_REQUIRED_CONFIRMATIONS) || 12,
      amountTolerance: parseFloat(process.env.ETH_AMOUNT_TOLERANCE) || 0.015,
    },
  },

  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    centralWallet: {
      address: process.env.SOLANA_CENTRAL_WALLET_ADDRESS,
    },
    feesWalletAddress: process.env.SOLANA_FEES_WALLET_ADDRESS || null,
    payment: {
      expirationMinutes: parseInt(process.env.SOLANA_PAYMENT_EXPIRATION_MINUTES) || 30,
      requiredConfirmations: parseInt(process.env.SOLANA_REQUIRED_CONFIRMATIONS) || 1,
      amountTolerance: parseFloat(process.env.SOLANA_AMOUNT_TOLERANCE) || 0.015,
    },
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
