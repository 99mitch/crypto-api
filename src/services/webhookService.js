const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const Payment = require('../models/Payment');

class WebhookService {
  /**
   * Envoie le webhook de confirmation de paiement
   * @param {object} payment - Document Payment mongoose
   */
  async sendConfirmation(payment) {
    const payload = {
      event: 'payment.confirmed',
      paymentId: payment.paymentId,
      currency: payment.currency,
      amount: payment.amount,
      usdAmount: payment.usdAmount,
      exchangeRate: payment.exchangeRate ?? null,
      receivedAmount: payment.receivedAmount,
      txHash: payment.txHash,
      senderAddress: payment.senderAddress ?? null,
      walletAddress: payment.wallet.address,
      metadata: payment.metadata,
      confirmedAt: new Date().toISOString(),
    };

    // Signature HMAC pour vérification
    const signature = this._sign(payload);

    try {
      await axios.post(config.webhook.internalUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': 'payment.confirmed',
        },
        timeout: 10000,
      });

      // Mettre à jour le statut webhook
      await Payment.findByIdAndUpdate(payment._id, {
        webhookSentAt: new Date(),
        $inc: { webhookAttempts: 1 },
      });

      console.log(`📨 Webhook envoyé pour ${payment.paymentId}`);
    } catch (error) {
      console.error(`❌ Webhook échoué pour ${payment.paymentId}:`, error.message);

      await Payment.findByIdAndUpdate(payment._id, {
        $inc: { webhookAttempts: 1 },
      });

      // Retry après 30s si moins de 3 tentatives
      if (payment.webhookAttempts < 3) {
        setTimeout(() => this.sendConfirmation(payment), 30000);
      }
    }
  }

  /**
   * Envoie le webhook de sweep complété
   * @param {object} payment
   */
  async sendSweepCompleted(payment) {
    const payload = {
      event: 'payment.swept',
      paymentId: payment.paymentId,
      currency: payment.currency,
      amount: payment.receivedAmount,
      usdAmount: payment.usdAmount,
      sweepTxHash: payment.sweepTxHash,
      sweepStatus: payment.sweepStatus,
      metadata: payment.metadata,
      payoutResults: payment.payoutResults || [],
      sweptAt: new Date().toISOString(),
    };

    const signature = this._sign(payload);

    try {
      await axios.post(config.webhook.internalUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': 'payment.swept',
        },
        timeout: 10000,
      });

      console.log(`📨 Webhook sweep envoyé pour ${payment.paymentId}`);
    } catch (error) {
      console.error(`❌ Webhook sweep échoué pour ${payment.paymentId}:`, error.message);
    }
  }

  /**
   * Signe le payload avec HMAC SHA256
   * @param {object} payload
   * @returns {string}
   */
  _sign(payload) {
    return crypto
      .createHmac('sha256', config.webhook.secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Vérifie la signature d'un webhook entrant
   * @param {object} payload
   * @param {string} signature
   * @returns {boolean}
   */
  static verifySignature(payload, signature) {
    const expected = crypto
      .createHmac('sha256', config.webhook.secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}

module.exports = new WebhookService();
