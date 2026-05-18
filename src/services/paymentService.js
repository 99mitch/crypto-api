const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const tronService = require('./tronService');
const btcService = require('./btcService');
const ethService = require('./ethService');
const solanaService = require('./solanaService');
const priceService = require('./priceService');
const qrCodeService = require('./qrCodeService');
const { encrypt } = require('../utils/encryption');
const config = require('../config');

const blockchainServices = {
  USDT: tronService,
  BTC: btcService,
  ETH: ethService,
  SOL: solanaService,
};

class PaymentService {
  /**
   * Crée une nouvelle demande de paiement
   * @param {number} amount - Montant en USDT
   * @param {object} options - { metadata, description }
   * @param {object} req - Express request (pour audit)
   * @returns {object} Payment public JSON
   */
  async createPayment(amount, options = {}, req = null) {
    const currency = (options.currency || 'USDT').toUpperCase();

    if (!blockchainServices[currency]) {
      throw new Error(`Devise non supportée: ${currency}`);
    }

    // Validation du payoutSplit (si présent dans metadata)
    if (options.metadata && Array.isArray(options.metadata.payoutSplit)) {
      const split = options.metadata.payoutSplit;
      if (currency === 'BTC') {
        throw new Error('payoutSplit non supporté pour BTC');
      }
      let total = 0;
      for (const dest of split) {
        if (!dest || typeof dest.address !== 'string' || !dest.address) {
          throw new Error('payoutSplit: chaque entrée doit avoir une address non vide');
        }
        if (typeof dest.ratio !== 'number' || dest.ratio <= 0 || dest.ratio > 1) {
          throw new Error('payoutSplit: ratio doit être un nombre dans ]0, 1]');
        }
        if (dest.currency && String(dest.currency).toUpperCase() !== currency) {
          throw new Error(`payoutSplit: currency doit matcher ${currency}`);
        }
        total += dest.ratio;
      }
      if (total > 1.000001) {
        throw new Error(`payoutSplit: somme des ratios (${total.toFixed(6)}) > 1`);
      }
    }

    // Idempotence
    if (options.externalRef) {
      const existing = await Payment.findOne({ externalRef: options.externalRef });
      if (existing) return existing.toPublicJSON();
    }

    // Conversion et paramètres par devise
    let usdAmount, cryptoAmount, exchangeRate, requiredConfirmations, expirationMinutes;

    if (currency === 'BTC') {
      exchangeRate = await priceService.getBTCRate();
      usdAmount = amount;
      cryptoAmount = parseFloat((usdAmount / exchangeRate).toFixed(8));
      requiredConfirmations = config.btc.payment.requiredConfirmations;
      expirationMinutes = config.btc.payment.expirationMinutes;
    } else if (currency === 'ETH') {
      exchangeRate = await priceService.getETHRate();
      usdAmount = amount;
      cryptoAmount = parseFloat((usdAmount / exchangeRate).toFixed(8));
      requiredConfirmations = config.eth.payment.requiredConfirmations;
      expirationMinutes = config.eth.payment.expirationMinutes;
    } else if (currency === 'SOL') {
      exchangeRate = await priceService.getSOLRate();
      usdAmount = amount;
      cryptoAmount = parseFloat((usdAmount / exchangeRate).toFixed(9));
      requiredConfirmations = config.solana.payment.requiredConfirmations;
      expirationMinutes = config.solana.payment.expirationMinutes;
    } else {
      // USDT : taux 1:1 USD
      exchangeRate = 1;
      usdAmount = amount;
      cryptoAmount = amount;
      requiredConfirmations = 1;
      expirationMinutes = config.payment.expirationMinutes;
    }

    // Générer le wallet dédié
    let walletData;
    if (currency === 'BTC') {
      walletData = btcService.generateWallet();
    } else if (currency === 'ETH') {
      walletData = ethService.generateWallet();
    } else if (currency === 'SOL') {
      walletData = solanaService.generateWallet();
    } else {
      walletData = await tronService.generateWallet();
    }

    const walletAddress = walletData.address;
    const rawPrivateKey = currency === 'BTC'
      ? walletData.privateKeyWIF
      : walletData.privateKey;

    // Chiffrer la clé privée si ENCRYPTION_KEY configurée
    let storedPrivateKey = rawPrivateKey;
    if (config.encryption.masterKey) {
      storedPrivateKey = encrypt(rawPrivateKey, config.encryption.masterKey);
    }

    // QR code (BIP21 pour BTC, adresse simple pour USDT)
    const qrCode = await qrCodeService.generatePaymentQR(walletAddress, cryptoAmount, {
      currency,
    });

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    const payment = await Payment.create({
      paymentId: `PAY-${uuidv4().split('-')[0].toUpperCase()}`,
      currency,
      amount: cryptoAmount,
      usdAmount,
      exchangeRate,
      requiredConfirmations,
      status: 'pending',
      wallet: {
        address: walletAddress,
        privateKey: storedPrivateKey,
        base58: walletAddress,
      },
      qrCode,
      expiresAt,
      metadata: options.metadata || {},
      description: options.description || '',
      externalRef: options.externalRef || null,
    });

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'payment_created',
      req,
    });

    const label = currency === 'USDT'
      ? `${amount} USDT`
      : `${cryptoAmount} ${currency} (~$${usdAmount} USD)`;
    console.log(`💳 Paiement créé: ${payment.paymentId} - ${label} → ${walletAddress}`);

    return payment.toPublicJSON();
  }

  /**
   * Récupère un paiement par son ID
   * @param {string} paymentId
   * @returns {object|null}
   */
  async getPayment(paymentId) {
    const payment = await Payment.findOne({ paymentId });
    if (!payment) return null;
    return payment.toPublicJSON();
  }

  /**
   * Récupère un paiement avec les infos admin
   * @param {string} paymentId
   * @returns {object|null}
   */
  async getPaymentAdmin(paymentId) {
    const payment = await Payment.findOne({ paymentId });
    if (!payment) return null;
    return payment.toAdminJSON();
  }

  /**
   * Liste les paiements avec filtres et pagination
   * @param {object} filters - { status, page, limit, from, to }
   * @returns {{ payments: Array, total: number, page: number, totalPages: number }}
   */
  async listPayments(filters = {}) {
    const { status, page = 1, limit = 20, from, to } = filters;
    const query = {};

    if (status) query.status = status;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const total = await Payment.countDocuments(query);
    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      payments: payments.map((p) => p.toAdminJSON()),
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Statistiques pour le dashboard
   * @returns {object}
   */
  async getStats() {
    const [totalPayments, statusCounts, revenueResult, todayResult] = await Promise.all([
      Payment.countDocuments(),
      Payment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Payment.aggregate([
        { $match: { status: { $in: ['confirmed', 'swept'] } } },
        {
          $addFields: {
            usdValue: {
              $cond: {
                if: { $eq: ['$currency', 'BTC'] },
                then: '$usdAmount',
                else: '$receivedAmount',
              },
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$usdValue' } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            status: { $in: ['confirmed', 'swept'] },
          },
        },
        {
          $addFields: {
            usdValue: {
              $cond: {
                if: { $eq: ['$currency', 'BTC'] },
                then: '$usdAmount',
                else: '$receivedAmount',
              },
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$usdValue' }, count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap = {};
    statusCounts.forEach((s) => (statusMap[s._id] = s.count));

    return {
      totalPayments,
      byStatus: statusMap,
      totalRevenue: revenueResult[0]?.total || 0,
      today: {
        revenue: todayResult[0]?.total || 0,
        count: todayResult[0]?.count || 0,
      },
    };
  }

  /**
   * Annule un paiement manuellement
   * @param {string} paymentId
   * @returns {object|null}
   */
  async cancelPayment(paymentId) {
    const payment = await Payment.findOneAndUpdate(
      { paymentId, status: 'pending' },
      { status: 'cancelled' },
      { new: true }
    );
    return payment ? payment.toAdminJSON() : null;
  }
}

module.exports = new PaymentService();
