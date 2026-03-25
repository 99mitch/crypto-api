const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const tronService = require('../services/tronService');
const webhookService = require('../services/webhookService');
const retryService = require('../services/retryService');
const { decrypt } = require('../utils/encryption');
const config = require('../config');

class PaymentMonitor {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
  }

  /**
   * Démarre le monitoring
   */
  start() {
    if (this.intervalId) return;

    const intervalMs = config.payment.checkIntervalSeconds * 1000;
    this.intervalId = setInterval(() => this.run(), intervalMs);
    console.log(
      `🔍 Payment monitor démarré (interval: ${config.payment.checkIntervalSeconds}s)`
    );

    // Premier run immédiat
    this.run();
  }

  /**
   * Arrête le monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Payment monitor arrêté');
    }
  }

  /**
   * Exécution principale du monitoring
   */
  async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      await this._expirePendingPayments();
      await this._checkPendingPayments();
      await this._processSweeps();
    } catch (error) {
      console.error('❌ Erreur PaymentMonitor:', error.message);
      await AuditLog.log({
        action: 'monitor_error',
        level: 'error',
        details: { error: error.message },
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Déchiffre la clé privée d'un wallet si le chiffrement est activé
   * @param {string} storedKey - Clé stockée (chiffrée ou en clair)
   * @returns {string} Clé privée en clair
   */
  _decryptPrivateKey(storedKey) {
    if (config.encryption.masterKey && storedKey.includes(':')) {
      return decrypt(storedKey, config.encryption.masterKey);
    }
    return storedKey;
  }

  /**
   * Expire les paiements dépassés
   */
  async _expirePendingPayments() {
    const expiredPayments = await Payment.find({
      status: 'pending',
      expiresAt: { $lte: new Date() },
    });

    if (expiredPayments.length > 0) {
      await Payment.updateMany(
        { _id: { $in: expiredPayments.map((p) => p._id) } },
        { status: 'expired' }
      );

      // Log chaque expiration
      for (const payment of expiredPayments) {
        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'payment_expired',
          details: { amount: payment.amount, wallet: payment.wallet.address },
        });
      }

      console.log(`⏰ ${expiredPayments.length} paiement(s) expiré(s)`);
    }
  }

  /**
   * Vérifie les paiements en attente pour détecter les réceptions USDT
   */
  async _checkPendingPayments() {
    const pendingPayments = await Payment.find({
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });

    for (const payment of pendingPayments) {
      try {
        // Vérifier le solde USDT sur le wallet dédié
        const balance = await tronService.getUSDTBalance(payment.wallet.address);

        if (balance >= payment.amount) {
          // Paiement reçu !
          console.log(
            `✅ Paiement reçu: ${payment.paymentId} - ${balance} USDT sur ${payment.wallet.address}`
          );

          // Récupérer le hash de la transaction
          const txs = await tronService.getIncomingUSDTTransactions(
            payment.wallet.address,
            payment.createdAt.getTime()
          );

          const matchingTx = txs.find((tx) => tx.amount >= payment.amount);

          payment.status = 'confirmed';
          payment.receivedAmount = balance;
          payment.txHash = matchingTx?.txHash || null;
          payment.confirmations = 1;
          payment.sweepStatus = 'pending';
          await payment.save();

          await AuditLog.log({
            paymentId: payment.paymentId,
            action: 'payment_confirmed',
            details: {
              receivedAmount: balance,
              txHash: matchingTx?.txHash,
              from: matchingTx?.from,
            },
          });

          // Envoyer le webhook avec retry intelligent
          try {
            await webhookService.sendConfirmation(payment);
          } catch (webhookErr) {
            console.error(`⚠️ Webhook initial échoué, retry planifié: ${webhookErr.message}`);
            retryService.scheduleWebhookRetry(payment, (p) =>
              webhookService.sendConfirmation(p)
            );
          }
        } else if (balance > 0 && balance < payment.amount) {
          // Montant partiel reçu
          console.log(
            `⚠️ Montant partiel: ${payment.paymentId} - ${balance}/${payment.amount} USDT`
          );
          payment.receivedAmount = balance;
          await payment.save();

          await AuditLog.log({
            paymentId: payment.paymentId,
            action: 'payment_partial_received',
            level: 'warn',
            details: { received: balance, expected: payment.amount },
          });
        }
      } catch (error) {
        console.error(
          `Erreur vérification ${payment.paymentId}:`,
          error.message
        );
      }

      // Petit délai entre chaque vérification pour éviter le rate limit
      await this._sleep(1000);
    }
  }

  /**
   * Traite les sweeps en attente
   */
  async _processSweeps() {
    const toSweep = await Payment.find({
      status: 'confirmed',
      sweepStatus: 'pending',
    });

    for (const payment of toSweep) {
      try {
        payment.sweepStatus = 'processing';
        await payment.save();

        console.log(
          `💸 Sweep en cours: ${payment.paymentId} - ${payment.receivedAmount} USDT`
        );

        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'sweep_initiated',
          details: { amount: payment.receivedAmount },
        });

        // Déchiffrer la clé privée
        const privateKey = this._decryptPrivateKey(payment.wallet.privateKey);

        const sweepTxHash = await tronService.sweepUSDT(
          privateKey,
          payment.wallet.address,
          payment.receivedAmount
        );

        payment.sweepTxHash = sweepTxHash;
        payment.sweepStatus = 'completed';
        payment.status = 'swept';
        await payment.save();

        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'sweep_completed',
          details: { txHash: sweepTxHash, amount: payment.receivedAmount },
        });

        console.log(`✅ Sweep terminé: ${payment.paymentId} → tx: ${sweepTxHash}`);

        // Webhook sweep
        await webhookService.sendSweepCompleted(payment);
      } catch (error) {
        console.error(`❌ Sweep échoué ${payment.paymentId}:`, error.message);
        payment.sweepStatus = 'failed';
        await payment.save();

        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'sweep_failed',
          level: 'error',
          details: { error: error.message },
        });

        // Planifier un retry intelligent
        retryService.scheduleSweepRetry(payment, (pk, addr, amt) =>
          tronService.sweepUSDT(this._decryptPrivateKey(pk), addr, amt)
        );
      }

      await this._sleep(3000);
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new PaymentMonitor();
