const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const tronService = require('../services/tronService');
const btcService = require('../services/btcService');
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
    // On n'expire qu'après le délai de grâce pour absorber les paiements tardifs
    const graceCutoff = new Date(Date.now() - config.payment.gracePeriodSeconds * 1000);
    const expiredPayments = await Payment.find({
      status: 'pending',
      expiresAt: { $lte: graceCutoff },
    });

    if (expiredPayments.length > 0) {
      await Payment.updateMany(
        { _id: { $in: expiredPayments.map((p) => p._id) } },
        { status: 'expired' }
      );

      await AuditLog.logMany(
        expiredPayments.map((p) => ({ paymentId: p.paymentId, action: 'payment_expired' }))
      );

      console.log(`⏰ ${expiredPayments.length} paiement(s) expiré(s)`);
    }
  }

  /**
   * Vérifie les paiements en attente et les paiements BTC en cours de confirmation
   */
  async _checkPendingPayments() {
    const graceCutoff = new Date(Date.now() - config.payment.gracePeriodSeconds * 1000);

    const confirmingCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Inclut les paiements BTC 'confirming' (attente de confirmations supplémentaires)
    // Les paiements confirming de plus de 24h sont ignorés (tx probablement droppée du mempool)
    const paymentsToCheck = await Payment.find({
      $or: [
        { status: 'pending', expiresAt: { $gt: graceCutoff } },
        {
          status: 'confirming',
          currency: 'BTC',
          $or: [
            { confirmingAt: { $exists: false } },
            { confirmingAt: { $gt: confirmingCutoff } },
          ],
        },
      ],
    });

    for (const payment of paymentsToCheck) {
      try {
        if (payment.currency === 'BTC') {
          await this._checkBTCPayment(payment);
        } else {
          await this._checkUSDTPayment(payment);
        }
      } catch (error) {
        console.error(`Erreur vérification ${payment.paymentId}:`, error.message);
      }
      await this._sleep(1000);
    }
  }

  /**
   * Vérifie un paiement USDT en attente
   */
  async _checkUSDTPayment(payment) {
    // Vérifier le solde USDT sur le wallet dédié
    const balance = await tronService.getUSDTBalance(payment.wallet.address);

    const minAccepted = payment.amount * (1 - config.payment.amountTolerance);
    if (balance >= minAccepted) {
      // Paiement reçu !
      const isPartial = balance < payment.amount;
      const isOverpaid = balance > payment.amount;
      const isLate = new Date() > payment.expiresAt;
      console.log(
        `✅ Paiement reçu: ${payment.paymentId} - ${balance}/${payment.amount} USDT` +
        `${isPartial ? ' (tolérance)' : ''}${isOverpaid ? ' (sur-paiement)' : ''}${isLate ? ' (tardif)' : ''}`
      );

      // Récupérer le hash de la transaction
      const txs = await tronService.getIncomingUSDTTransactions(
        payment.wallet.address,
        payment.createdAt.getTime()
      );

      const matchingTx = txs.find((tx) => tx.amount >= minAccepted);

      payment.status = 'confirmed';
      // Sur-paiement : on crédite uniquement le montant demandé côté PHP
      // Le sweep récupérera le solde réel complet
      payment.receivedAmount = isOverpaid ? payment.amount : balance;
      payment.txHash = matchingTx?.txHash || null;
      payment.senderAddress = matchingTx?.from || null;
      payment.confirmations = 1;
      payment.sweepStatus = 'pending';
      await payment.save();

      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirmed',
        details: matchingTx?.txHash ? { txHash: matchingTx.txHash } : {},
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
    } else if (balance > 0 && balance < minAccepted) {
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
      });
    }
  }

  /**
   * Vérifie un paiement BTC (gère pending → confirming → confirmed)
   */
  async _checkBTCPayment(payment) {
    const minAccepted = payment.amount * (1 - config.btc.payment.amountTolerance);

    const balance = await btcService.getBalance(payment.wallet.address);
    if (balance < minAccepted) return;

    const txs = await btcService.getIncomingTransactions(payment.wallet.address);
    const matchingTx = txs.find(tx => tx.amount >= minAccepted);
    if (!matchingTx) return;

    const confirmations = await btcService.getTransactionConfirmations(matchingTx.txHash);

    // Mettre à jour les champs communs
    payment.confirmations = confirmations;
    payment.txHash = payment.txHash || matchingTx.txHash;
    payment.receivedAmount = payment.receivedAmount || balance;

    if (confirmations >= payment.requiredConfirmations) {
      // Seuil atteint — valider (depuis pending ou confirming)
      payment.status = 'confirmed';
      payment.sweepStatus = 'pending';
      await payment.save();
      console.log(
        `✅ BTC confirmé: ${payment.paymentId} (${confirmations}/${payment.requiredConfirmations} confirmations, tx: ${matchingTx.txHash})`
      );

      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirmed',
        details: { txHash: matchingTx.txHash, confirmations },
      });

      try {
        await webhookService.sendConfirmation(payment);
      } catch (webhookErr) {
        console.error(`⚠️ Webhook BTC initial échoué, retry planifié: ${webhookErr.message}`);
        retryService.scheduleWebhookRetry(payment, p => webhookService.sendConfirmation(p));
      }
    } else if (payment.status === 'pending' && confirmations >= 1) {
      // Première confirmation — passer en confirming
      payment.status = 'confirming';
      payment.confirmingAt = new Date();
      await payment.save();
      console.log(
        `🔄 BTC confirming: ${payment.paymentId} (${confirmations}/${payment.requiredConfirmations} confirmation(s))`
      );
      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirming',
        details: { txHash: matchingTx.txHash, confirmations },
      });
    } else if (payment.status === 'confirming') {
      // Mise à jour du compteur uniquement
      await payment.save();
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
          `💸 Sweep en cours: ${payment.paymentId} - ${payment.receivedAmount} ${payment.currency}`
        );

        await AuditLog.log({
          paymentId: payment.paymentId,
          action: 'sweep_initiated',
        });

        // Déchiffrer la clé privée
        const privateKey = this._decryptPrivateKey(payment.wallet.privateKey);

        if (payment.currency === 'BTC') {
          await this._sweepBTCPayment(payment, privateKey);
        } else {
          await this._sweepUSDTPayment(payment, privateKey);
        }
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
        retryService.scheduleSweepRetry(payment, async (pk, addr, amt) => {
          const decryptedKey = this._decryptPrivateKey(pk);
          if (payment.currency === 'BTC') {
            const { txHash } = await btcService.sweepBTC(
              decryptedKey,
              addr,
              config.btc.centralWallet.address,
              config.btc.feesWalletAddress,
              config.fees.percentage
            );
            return txHash;
          }
          return tronService.sweepUSDT(decryptedKey, addr, amt);
        });
      }

      await this._sleep(3000);
    }
  }

  /**
   * Effectue le sweep d'un paiement USDT
   */
  async _sweepUSDTPayment(payment, privateKey) {
    // Re-fetch le solde réel pour sweeper tout (couvre le sur-paiement)
    const actualBalance = await tronService.getUSDTBalance(payment.wallet.address);
    const sweepTotal = Math.floor(actualBalance * 1e6) / 1e6;

    const hasFees = config.fees.walletAddress && config.fees.percentage > 0;
    const nbTransfers = hasFees ? 2 : 1;

    // Envoyer le TRX pour gas (une seule fois, pour couvrir tous les transferts)
    await tronService.ensureGasForSweep(payment.wallet.address, nbTransfers);

    let feesAmount = null;
    let feesTxHash = null;
    let sweepTxHash;

    if (hasFees) {
      feesAmount = Math.floor(sweepTotal * config.fees.percentage * 1e6) / 1e6;
      const netAmount = Math.floor((sweepTotal - feesAmount) * 1e6) / 1e6;

      console.log(`💰 Frais: ${feesAmount} USDT (${config.fees.percentage * 100}%) → fees wallet`);

      feesTxHash = await tronService.sweepUSDT(
        privateKey,
        payment.wallet.address,
        feesAmount,
        config.fees.walletAddress
      );

      await this._sleep(3000);

      sweepTxHash = await tronService.sweepUSDT(
        privateKey,
        payment.wallet.address,
        netAmount,
        config.tron.centralWallet.address
      );
    } else {
      sweepTxHash = await tronService.sweepUSDT(
        privateKey,
        payment.wallet.address,
        sweepTotal,
        config.tron.centralWallet.address
      );
    }

    payment.sweepTxHash = sweepTxHash;
    payment.feesAmount = feesAmount;
    payment.feesTxHash = feesTxHash;
    payment.sweepStatus = 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash: sweepTxHash },
    });

    console.log(`✅ Sweep USDT terminé: ${payment.paymentId} → tx: ${sweepTxHash}`);
    await webhookService.sendSweepCompleted(payment);
  }

  /**
   * Effectue le sweep d'un paiement BTC
   */
  async _sweepBTCPayment(payment, privateKeyWIF) {
    const feesWalletAddress = config.btc.feesWalletAddress || null;
    const feesPercentage = feesWalletAddress && config.fees.percentage > 0
      ? config.fees.percentage
      : 0;

    const { txHash, feesAmount } = await btcService.sweepBTC(
      privateKeyWIF,
      payment.wallet.address,
      config.btc.centralWallet.address,
      feesWalletAddress,
      feesPercentage
    );

    payment.sweepTxHash = txHash;
    payment.feesAmount = feesAmount > 0 ? feesAmount : null;
    payment.feesTxHash = null; // fees inclus dans la même tx BTC
    payment.sweepStatus = 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash },
    });
    console.log(`✅ Sweep BTC terminé: ${payment.paymentId} → tx: ${txHash}`);
    await webhookService.sendSweepCompleted(payment);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new PaymentMonitor();
