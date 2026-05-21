const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    // Identifiant unique du paiement
    paymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Montant attendu en USDT, BTC, ETH ou SOL
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: function (value) {
          const minAmounts = { BTC: 0.00001, ETH: 0.0001, SOL: 0.001 };
          const minAmount = minAmounts[this.currency] || 0.01;
          return value >= minAmount;
        },
        message: function (props) {
          const minAmounts = { BTC: 0.00001, ETH: 0.0001, SOL: 0.001 };
          const minAmount = minAmounts[this.currency] || 0.01;
          return `amount must be at least ${minAmount}`;
        },
      },
    },

    // Statut du paiement
    status: {
      type: String,
      enum: ['pending', 'confirming', 'confirmed', 'expired', 'cancelled', 'swept', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },

    // Wallet généré pour cette transaction
    wallet: {
      address: { type: String, required: true, index: true },
      privateKey: { type: String, required: true }, // Chiffré AES-256-GCM
      base58: { type: String },
    },

    // QR Code (data URI base64)
    qrCode: { type: String, default: null },

    // Infos blockchain
    txHash: { type: String, default: null },
    senderAddress: { type: String, default: null },
    confirmations: { type: Number, default: 0 },
    receivedAmount: { type: Number, default: 0 },

    // Sweep info
    sweepTxHash: { type: String, default: null },
    feesAmount: { type: Number, default: null },
    feesTxHash: { type: String, default: null },
    sweepStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'partial', null],
      default: null,
    },
    sweepRetryCount: { type: Number, default: 0 },

    // Payout split results (multi-destinations vers wallets collab)
    payoutResults: {
      type: [
        new mongoose.Schema(
          {
            collabId: { type: Number },
            address: { type: String, required: true },
            amount: { type: Number, required: true },
            currency: { type: String },
            txHash: { type: String, default: null },
            status: { type: String, enum: ['success', 'failed'], required: true },
            error: { type: String, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Refund info
    refundTxHash: { type: String, default: null },
    refundedAt: { type: Date, default: null },

    // Timestamp du passage en statut 'confirming' (BTC uniquement)
    confirmingAt: {
      type: Date,
      default: null,
    },

    // Expiration
    expiresAt: { type: Date, required: true, index: true },

    // Webhook
    webhookSentAt: { type: Date, default: null },
    webhookAttempts: { type: Number, default: 0 },

    // URL de callback dédié pour ce paiement (override de WEBHOOK_INTERNAL_URL).
    // Permet à plusieurs consommateurs (auto-shop, bot, etc.) de recevoir leurs
    // propres webhooks sans interférence.
    callbackUrl: { type: String, default: null },

    // Métadonnées libres (orderId, userId, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Description / référence
    description: { type: String, default: '' },

    // Référence externe (idempotence) — ex: "recharge-USR123-1743200000"
    externalRef: { type: String, default: null, index: true, sparse: true },

    // Devise du paiement
    currency: {
      type: String,
      enum: ['USDT', 'BTC', 'ETH', 'SOL'],
      default: 'USDT',
      index: true,
    },

    // Montant en USD passé par le marchand (= amount pour USDT, ≠ amount pour BTC)
    usdAmount: {
      type: Number,
      default: null,
    },

    // Taux de change USD/crypto au moment de la création (null pour USDT)
    exchangeRate: {
      type: Number,
      default: null,
    },

    // Confirmations blockchain requises pour valider (1 USDT, 3 BTC)
    requiredConfirmations: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Index composé pour le monitoring
paymentSchema.index({ status: 1, expiresAt: 1 });
paymentSchema.index({ 'wallet.address': 1, status: 1 });

// Méthode pour vérifier si expiré
paymentSchema.methods.isExpired = function () {
  return this.status === 'pending' && new Date() > this.expiresAt;
};

// Méthode pour le format API (masquer la clé privée)
paymentSchema.methods.toPublicJSON = function () {
  return {
    paymentId: this.paymentId,
    currency: this.currency,
    amount: this.amount,
    usdAmount: this.usdAmount,
    exchangeRate: this.exchangeRate,
    status: this.status,
    walletAddress: this.wallet.address,
    qrCode: this.qrCode,
    txHash: this.txHash,
    senderAddress: this.senderAddress,
    receivedAmount: this.receivedAmount,
    sweepStatus: this.sweepStatus,
    expiresAt: this.expiresAt,
    metadata: this.metadata,
    description: this.description,
    externalRef: this.externalRef,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

// Méthode admin (inclut plus de détails)
paymentSchema.methods.toAdminJSON = function () {
  return {
    ...this.toPublicJSON(),
    confirmations: this.confirmations,
    sweepTxHash: this.sweepTxHash,
    feesAmount: this.feesAmount,
    feesTxHash: this.feesTxHash,
    webhookSentAt: this.webhookSentAt,
    webhookAttempts: this.webhookAttempts,
    refundTxHash: this.refundTxHash,
    refundedAt: this.refundedAt,
  };
};

module.exports = mongoose.model('Payment', paymentSchema);
