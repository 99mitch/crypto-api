const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');

/**
 * Stratégie de retry avec backoff exponentiel
 *
 * Tentative 1 : immédiat
 * Tentative 2 : 30s
 * Tentative 3 : 2min
 * Tentative 4 : 10min
 * Tentative 5 : 30min
 * Tentative 6 : 2h (max)
 */

const RETRY_DELAYS = [
  0,        // Tentative 1 : immédiat
  30000,    // Tentative 2 : 30s
  120000,   // Tentative 3 : 2min
  600000,   // Tentative 4 : 10min
  1800000,  // Tentative 5 : 30min
  7200000,  // Tentative 6 : 2h
];

const MAX_WEBHOOK_RETRIES = 6;
const MAX_SWEEP_RETRIES = 4;

class RetryService {
  constructor() {
    // Timers actifs : Map<paymentId, timeoutId>
    this.activeTimers = new Map();
  }

  /**
   * Planifie un retry de webhook avec backoff exponentiel
   * @param {object} payment - Document Payment
   * @param {Function} webhookFn - Fonction à appeler (webhookService.sendConfirmation)
   */
  scheduleWebhookRetry(payment, webhookFn) {
    const attempt = payment.webhookAttempts || 0;

    if (attempt >= MAX_WEBHOOK_RETRIES) {
      console.error(`🚫 Webhook abandonné pour ${payment.paymentId} après ${attempt} tentatives`);
      this._logRetryExhausted(payment, 'webhook');
      return;
    }

    const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
    const timerId = `webhook:${payment.paymentId}`;

    // Annuler un éventuel timer existant
    this.cancelRetry(timerId);

    console.log(
      `🔄 Webhook retry #${attempt + 1} pour ${payment.paymentId} dans ${this._formatDelay(delay)}`
    );

    const timeoutId = setTimeout(async () => {
      this.activeTimers.delete(timerId);

      try {
        await webhookFn(payment);

        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'webhook_retry_success',
        });
      } catch (error) {
        console.error(
          `❌ Webhook retry #${attempt + 1} échoué pour ${payment.paymentId}:`,
          error.message
        );

        // Recharger le payment pour avoir le dernier état
        const freshPayment = await Payment.findOne({ paymentId: payment.paymentId });
        if (freshPayment) {
          this.scheduleWebhookRetry(freshPayment, webhookFn);
        }
      }
    }, delay);

    this.activeTimers.set(timerId, timeoutId);
  }

  /**
   * Planifie un retry de sweep avec backoff exponentiel
   * @param {object} payment - Document Payment
   * @param {Function} sweepFn - Fonction de sweep
   */
  scheduleSweepRetry(payment, sweepFn) {
    const attempt = payment.sweepRetryCount || 0;

    if (attempt >= MAX_SWEEP_RETRIES) {
      console.error(`🚫 Sweep abandonné pour ${payment.paymentId} après ${attempt} tentatives`);
      this._logRetryExhausted(payment, 'sweep');
      return;
    }

    const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
    const timerId = `sweep:${payment.paymentId}`;

    this.cancelRetry(timerId);

    console.log(
      `🔄 Sweep retry #${attempt + 1} pour ${payment.paymentId} dans ${this._formatDelay(delay)}`
    );

    const timeoutId = setTimeout(async () => {
      this.activeTimers.delete(timerId);

      try {
        const txHash = await sweepFn(
          payment.wallet.privateKey,
          payment.wallet.address,
          payment.receivedAmount
        );

        // Succès → mettre à jour
        await Payment.findByIdAndUpdate(payment._id, {
          sweepTxHash: txHash,
          sweepStatus: 'completed',
          status: 'swept',
          $inc: { sweepRetryCount: 1 },
        });

        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'sweep_retry_success',
          details: { txHash },
        });

        console.log(`✅ Sweep retry réussi pour ${payment.paymentId} → tx: ${txHash}`);
      } catch (error) {
        console.error(
          `❌ Sweep retry #${attempt + 1} échoué pour ${payment.paymentId}:`,
          error.message
        );

        await Payment.findByIdAndUpdate(payment._id, {
          $inc: { sweepRetryCount: 1 },
        });

        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'sweep_retry_failed',
          level: 'error',
          details: { error: error.message },
        });

        // Re-planifier
        const freshPayment = await Payment.findOne({ paymentId: payment.paymentId });
        if (freshPayment && freshPayment.sweepStatus === 'failed') {
          this.scheduleSweepRetry(freshPayment, sweepFn);
        }
      }
    }, delay);

    this.activeTimers.set(timerId, timeoutId);
  }

  /**
   * Annule un retry planifié
   * @param {string} timerId
   */
  cancelRetry(timerId) {
    if (this.activeTimers.has(timerId)) {
      clearTimeout(this.activeTimers.get(timerId));
      this.activeTimers.delete(timerId);
    }
  }

  /**
   * Annule tous les retries (pour le shutdown propre)
   */
  cancelAll() {
    for (const [id, timeout] of this.activeTimers) {
      clearTimeout(timeout);
    }
    this.activeTimers.clear();
    console.log('🛑 Tous les retries annulés');
  }

  /**
   * Nombre de retries actifs
   * @returns {number}
   */
  get activeCount() {
    return this.activeTimers.size;
  }

  /**
   * Log quand les retries sont épuisés
   */
  async _logRetryExhausted(payment, type) {
    await AuditLog.log({
      paymentId: payment.paymentId,
      action: `${type}_retries_exhausted`,
      level: 'error',
      details: {
        type,
        maxRetries: type === 'webhook' ? MAX_WEBHOOK_RETRIES : MAX_SWEEP_RETRIES,
      },
    });
  }

  /**
   * Formatte un délai en texte lisible
   */
  _formatDelay(ms) {
    if (ms === 0) return 'immédiatement';
    if (ms < 60000) return `${ms / 1000}s`;
    if (ms < 3600000) return `${ms / 60000}min`;
    return `${ms / 3600000}h`;
  }
}

module.exports = new RetryService();
