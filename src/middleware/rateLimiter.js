/**
 * Rate limiter en mémoire (pas besoin de Redis pour 50 paiements simultanés)
 * En prod à plus grande échelle → utiliser express-rate-limit + redis-store
 */

class RateLimiter {
  constructor() {
    // Map: ip -> { count, resetAt }
    this.store = new Map();
    // Nettoyage périodique toutes les 5 min
    setInterval(() => this._cleanup(), 300000);
  }

  /**
   * Crée un middleware de rate limiting
   * @param {object} options
   * @param {number} options.windowMs - Fenêtre de temps en ms (défaut: 60s)
   * @param {number} options.max - Nombre max de requêtes par fenêtre (défaut: 30)
   * @param {string} options.message - Message d'erreur
   * @returns {Function} Express middleware
   */
  middleware({ windowMs = 60000, max = 30, message = 'Trop de requêtes, réessayez plus tard.' } = {}) {
    return (req, res, next) => {
      const key = this._getKey(req);
      const now = Date.now();
      const record = this.store.get(key);

      if (!record || now > record.resetAt) {
        // Nouvelle fenêtre
        this.store.set(key, { count: 1, resetAt: now + windowMs });
        this._setHeaders(res, max, max - 1, new Date(now + windowMs));
        return next();
      }

      record.count++;

      if (record.count > max) {
        this._setHeaders(res, max, 0, new Date(record.resetAt));
        return res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: Math.ceil((record.resetAt - now) / 1000),
        });
      }

      this._setHeaders(res, max, max - record.count, new Date(record.resetAt));
      return next();
    };
  }

  _getKey(req) {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }

  _setHeaders(res, limit, remaining, resetAt) {
    res.set({
      'X-RateLimit-Limit': limit,
      'X-RateLimit-Remaining': Math.max(0, remaining),
      'X-RateLimit-Reset': resetAt.toISOString(),
    });
  }

  _cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store) {
      if (now > record.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

const limiter = new RateLimiter();

module.exports = {
  // Rate limit global : 60 req/min
  globalLimiter: limiter.middleware({ windowMs: 60000, max: 60 }),

  // Rate limit création de paiement : 10/min (anti-spam)
  paymentCreateLimiter: limiter.middleware({
    windowMs: 60000,
    max: 10,
    message: 'Trop de paiements créés, attendez 1 minute.',
  }),

  // Rate limit admin : 120 req/min (dashboard polling)
  adminLimiter: limiter.middleware({ windowMs: 60000, max: 120 }),

  // Rate limit status polling : 30/min par IP
  statusPollLimiter: limiter.middleware({
    windowMs: 60000,
    max: 30,
    message: 'Polling trop fréquent.',
  }),
};
