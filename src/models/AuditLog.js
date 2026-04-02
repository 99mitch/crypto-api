const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    // Paiement associé (optionnel pour les événements système)
    paymentId: {
      type: String,
      index: true,
      default: null,
    },

    // Action effectuée
    action: {
      type: String,
      required: true,
      index: true,
      enum: [
        // Cycle de vie paiement
        'payment_created',
        'payment_expired',
        'payment_confirmed',
        'payment_confirming',
        'payment_cancelled',
        'payment_partial_received',

        // Sweep
        'sweep_initiated',
        'sweep_gas_sent',
        'sweep_completed',
        'sweep_failed',
        'sweep_retry_success',
        'sweep_retry_failed',
        'sweep_retries_exhausted',
        'sweep_manual_retry',

        // Webhook
        'webhook_sent',
        'webhook_failed',
        'webhook_retry_success',
        'webhook_retry_failed',
        'webhook_retries_exhausted',

        // Admin
        'admin_login',
        'admin_login_failed',
        'admin_cancel_payment',
        'admin_retry_sweep',

        // Système
        'monitor_cycle_start',
        'monitor_cycle_end',
        'monitor_error',
        'api_error',
        'rate_limit_hit',
        'sweep_recovery_on_startup',
      ],
    },

    // Niveau de sévérité
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'debug'],
      default: 'info',
      index: true,
    },

    // Détails libres (JSON)
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // IP source (pour les actions API)
    ip: {
      type: String,
      default: null,
    },

    // User-agent
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    // TTL : supprimer les logs de plus de 90 jours automatiquement
    expireAfterSeconds: undefined,
  }
);

// Index composé pour les requêtes fréquentes
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ paymentId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ level: 1, createdAt: -1 });

// TTL index : auto-suppression après 90 jours
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

/**
 * Méthode statique pour créer un log facilement
 * @param {object} params
 * @param {string} params.paymentId
 * @param {string} params.action
 * @param {string} params.level
 * @param {object} params.details
 * @param {object} params.req - Objet Express Request (optionnel)
 */
auditLogSchema.statics.log = async function (params) {
  const { paymentId, action, level = 'info', details = {}, req } = params;

  try {
    await this.create({
      paymentId,
      action,
      level,
      details,
      ip: req?.ip || req?.connection?.remoteAddress || null,
      userAgent: req?.headers?.['user-agent'] || null,
    });
  } catch (error) {
    // Le logging ne doit jamais casser l'app
    console.error('⚠️ Erreur écriture AuditLog:', error.message);
  }
};

auditLogSchema.statics.logMany = async function (entries) {
  if (!entries.length) return;
  try {
    await this.insertMany(entries.map(({ paymentId, action, level = 'info', details = {} }) => ({
      paymentId, action, level, details,
    })));
  } catch (error) {
    console.error('⚠️ Erreur écriture AuditLog batch:', error.message);
  }
};

/**
 * Récupère l'historique d'un paiement
 */
auditLogSchema.statics.getPaymentHistory = async function (paymentId) {
  return this.find({ paymentId })
    .sort({ createdAt: 1 })
    .select('-__v')
    .lean();
};

/**
 * Recherche dans les logs avec filtres
 * @param {object} filters
 * @param {string} filters.paymentId
 * @param {string} filters.action
 * @param {string} filters.level
 * @param {Date} filters.from
 * @param {Date} filters.to
 * @param {number} filters.page
 * @param {number} filters.limit
 */
auditLogSchema.statics.search = async function (filters = {}) {
  const { paymentId, action, level, from, to, page = 1, limit = 50 } = filters;
  const query = {};

  if (paymentId) query.paymentId = paymentId;
  if (action) query.action = action;
  if (level) query.level = level;
  if (from || to) {
    query.createdAt = {};
    if (from) query.createdAt.$gte = new Date(from);
    if (to) query.createdAt.$lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v')
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    logs,
    total,
    page: parseInt(page),
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Stats des logs (pour le dashboard)
 */
auditLogSchema.statics.getStats = async function (hours = 24) {
  const since = new Date(Date.now() - hours * 3600000);

  const [byAction, byLevel, total] = await Promise.all([
    this.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    this.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$level', count: { $sum: 1 } } },
    ]),
    this.countDocuments({ createdAt: { $gte: since } }),
  ]);

  return {
    period: `${hours}h`,
    total,
    byAction: Object.fromEntries(byAction.map((a) => [a._id, a.count])),
    byLevel: Object.fromEntries(byLevel.map((l) => [l._id, l.count])),
  };
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
