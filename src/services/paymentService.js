const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const tronService = require('./tronService');
const qrCodeService = require('./qrCodeService');
const { encrypt } = require('../utils/encryption');
const config = require('../config');

class PaymentService {
  /**
   * Crée une nouvelle demande de paiement
   * @param {number} amount - Montant en USDT
   * @param {object} options - { metadata, description }
   * @param {object} req - Express request (pour audit)
   * @returns {object} Payment public JSON
   */
  async createPayment(amount, options = {}, req = null) {
    // Générer un wallet dédié
    const wallet = await tronService.generateWallet();

    // Chiffrer la clé privée si ENCRYPTION_KEY est configurée
    let storedPrivateKey = wallet.privateKey;
    if (config.encryption.masterKey) {
      storedPrivateKey = encrypt(wallet.privateKey, config.encryption.masterKey);
    }

    // Générer le QR code
    const qrCode = await qrCodeService.generatePaymentQR(wallet.address, amount);

    // Calculer l'expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + config.payment.expirationMinutes);

    const payment = await Payment.create({
      paymentId: `PAY-${uuidv4().split('-')[0].toUpperCase()}`,
      amount,
      status: 'pending',
      wallet: {
        address: wallet.address,
        privateKey: storedPrivateKey,
        base58: wallet.base58,
      },
      qrCode,
      expiresAt,
      metadata: options.metadata || {},
      description: options.description || '',
    });

    // Audit log
    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'payment_created',
      details: { amount, wallet: wallet.address, expiresAt },
      req,
    });

    console.log(`💳 Paiement créé: ${payment.paymentId} - ${amount} USDT → ${wallet.address}`);

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
        { $group: { _id: null, total: { $sum: '$receivedAmount' } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            status: { $in: ['confirmed', 'swept'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$receivedAmount' }, count: { $sum: 1 } } },
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
      { status: 'expired' },
      { new: true }
    );
    return payment ? payment.toAdminJSON() : null;
  }
}

module.exports = new PaymentService();
