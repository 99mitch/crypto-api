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

    // Montant attendu en USDT
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    // Statut du paiement
    status: {
      type: String,
      enum: ['pending', 'confirming', 'confirmed', 'expired', 'swept', 'failed'],
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
    sweepStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', null],
      default: null,
    },
    sweepRetryCount: { type: Number, default: 0 },

    // Expiration
    expiresAt: { type: Date, required: true, index: true },

    // Webhook
    webhookSentAt: { type: Date, default: null },
    webhookAttempts: { type: Number, default: 0 },

    // Métadonnées libres (orderId, userId, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Description / référence
    description: { type: String, default: '' },

    // Référence externe (idempotence) — ex: "recharge-USR123-1743200000"
    externalRef: { type: String, default: null, index: true, sparse: true },
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
    amount: this.amount,
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
    webhookSentAt: this.webhookSentAt,
    webhookAttempts: this.webhookAttempts,
  };
};

module.exports = mongoose.model('Payment', paymentSchema);
