const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const tronService = require('../services/tronService');
const btcService = require('../services/btcService');
const ethService = require('../services/ethService');
const solanaService = require('../services/solanaService');
const webhookService = require('../services/webhookService');
const retryService = require('../services/retryService');
const { decrypt } = require('../utils/encryption');
const config = require('../config');

class PaymentMonitor {
  constructor() {
    this.isRunningUsdt = false;
    this.isRunningBtc = false;
    this.usdtIntervalId = null;
    this.btcIntervalId = null;
  }

  /**
   * Démarre le monitoring
   */
  async start() {
    if (this.usdtIntervalId) return;

    await this._recoverFailedSweeps();

    const usdtMs = config.payment.checkIntervalSeconds * 1000;
    const btcMs = config.payment.btcCheckIntervalSeconds * 1000;

    this.usdtIntervalId = setInterval(() => this._runUsdt(), usdtMs);
    this.btcIntervalId = setInterval(() => this._runBtc(), btcMs);

    console.log(
      `🔍 Payment monitor démarré (USDT: ${config.payment.checkIntervalSeconds}s, BTC: ${config.payment.btcCheckIntervalSeconds}s)`
    );

    // Premier run immédiat
    this._runUsdt();
    this._runBtc();
  }

  /**
   * Au démarrage, remet les sweeps échoués en 'pending' pour qu'ils soient retraités.
   * Couvre les crashes et redéploiements où les timers en mémoire sont perdus.
   */
  async _recoverFailedSweeps() {
    const failed = await Payment.find({ status: 'confirmed', sweepStatus: 'failed' });
    if (failed.length === 0) return;

    await Payment.updateMany(
      { _id: { $in: failed.map(p => p._id) } },
      { sweepStatus: 'pending' }
    );

    await AuditLog.logMany(
      failed.map(p => ({ paymentId: p.paymentId, action: 'sweep_recovery_on_startup' }))
    );

    console.log(`🔁 ${failed.length} sweep(s) échoué(s) remis en attente au démarrage`);
  }

  /**
   * Arrête le monitoring
   */
  stop() {
    if (this.usdtIntervalId) {
      clearInterval(this.usdtIntervalId);
      this.usdtIntervalId = null;
    }
    if (this.btcIntervalId) {
      clearInterval(this.btcIntervalId);
      this.btcIntervalId = null;
    }
    console.log('🛑 Payment monitor arrêté');
  }

  /**
   * Cycle USDT : expire + vérifie USDT + sweeps USDT
   */
  async _runUsdt() {
    if (this.isRunningUsdt) return;
    this.isRunningUsdt = true;
    try {
      await this._expirePendingPayments();
      await this._checkPendingPayments('USDT');
      await this._processSweeps('USDT');
    } catch (error) {
      console.error('❌ Erreur PaymentMonitor USDT:', error.message);
      await AuditLog.log({ action: 'monitor_error', level: 'error', details: { error: error.message } });
    } finally {
      this.isRunningUsdt = false;
    }
  }

  /**
   * Cycle BTC : vérifie BTC + sweeps BTC
   */
  async _runBtc() {
    if (this.isRunningBtc) return;
    this.isRunningBtc = true;
    try {
      await this._checkPendingPayments('BTC');
      await this._processSweeps('BTC');
    } catch (error) {
      console.error('❌ Erreur PaymentMonitor BTC:', error.message);
      await AuditLog.log({ action: 'monitor_error', level: 'error', details: { error: error.message } });
    } finally {
      this.isRunningBtc = false;
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

    // Expirer les paiements bloqués en 'confirming' depuis plus de 24h (BTC, ETH, SOL)
    const confirmingCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stalledConfirming = await Payment.find({
      status: 'confirming',
      currency: { $in: ['BTC', 'ETH', 'SOL'] },
      confirmingAt: { $lt: confirmingCutoff },
    });

    for (const payment of stalledConfirming) {
      payment.status = 'expired';
      await payment.save();
      console.log(`⏰ ${payment.currency} paiement confirming expiré (>24h): ${payment.paymentId}`);
      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_expired',
        details: { reason: 'confirming_timeout_24h' },
      });
    }
  }

  /**
   * Vérifie les paiements en attente et les paiements en cours de confirmation
   * @param {'BTC'|'USDT'} currency - 'BTC' = cycle lent, 'USDT' = cycle rapide (USDT + ETH + SOL)
   */
  async _checkPendingPayments(currency) {
    const graceCutoff = new Date(Date.now() - config.payment.gracePeriodSeconds * 1000);

    const confirmingCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const paymentsToCheck = await Payment.find(
      currency === 'BTC'
        ? {
            $or: [
              { status: 'pending', currency: 'BTC', expiresAt: { $gt: graceCutoff } },
              {
                status: 'confirming',
                currency: 'BTC',
                $or: [
                  { confirmingAt: { $exists: false } },
                  { confirmingAt: { $gt: confirmingCutoff } },
                ],
              },
            ],
          }
        : {
            // Cycle non-BTC : USDT (pas de confirming), ETH et SOL (avec confirming)
            $or: [
              { status: 'pending', currency: { $ne: 'BTC' }, expiresAt: { $gt: graceCutoff } },
              {
                status: 'confirming',
                currency: { $in: ['ETH', 'SOL'] },
                $or: [
                  { confirmingAt: { $exists: false } },
                  { confirmingAt: { $gt: confirmingCutoff } },
                ],
              },
            ],
          }
    );

    for (const payment of paymentsToCheck) {
      try {
        if (payment.currency === 'BTC') {
          await this._checkBTCPayment(payment);
        } else if (payment.currency === 'ETH') {
          await this._checkETHPayment(payment);
        } else if (payment.currency === 'SOL') {
          await this._checkSOLPayment(payment);
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

    // Un seul appel pour le solde + les transactions (réduit les appels BlockCypher)
    const { balance, txs } = await btcService.getAddressInfo(payment.wallet.address);
    if (balance < minAccepted) return;

    const matchingTx = txs.find(tx => tx.amount >= minAccepted);
    if (!matchingTx) return;

    const confirmations = matchingTx.confirmations;

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
   * Vérifie un paiement ETH (gère pending → confirming → confirmed)
   */
  async _checkETHPayment(payment) {
    const minAccepted = payment.amount * (1 - config.eth.payment.amountTolerance);

    const balance = await ethService.getBalance(payment.wallet.address);
    if (balance < minAccepted) return;

    const txs = await ethService.getIncomingTransactions(payment.wallet.address);
    const matchingTx = txs.find(tx => tx.amount >= minAccepted);
    if (!matchingTx) return;

    const confirmations = await ethService.getTransactionConfirmations(matchingTx.txHash);

    payment.confirmations = confirmations;
    payment.txHash = payment.txHash || matchingTx.txHash;
    payment.receivedAmount = payment.receivedAmount || balance;

    if (confirmations >= payment.requiredConfirmations) {
      payment.status = 'confirmed';
      payment.sweepStatus = 'pending';
      await payment.save();
      console.log(
        `✅ ETH confirmé: ${payment.paymentId} (${confirmations}/${payment.requiredConfirmations} confirmations, tx: ${matchingTx.txHash})`
      );

      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirmed',
        details: { txHash: matchingTx.txHash, confirmations },
      });

      try {
        await webhookService.sendConfirmation(payment);
      } catch (webhookErr) {
        console.error(`⚠️ Webhook ETH initial échoué, retry planifié: ${webhookErr.message}`);
        retryService.scheduleWebhookRetry(payment, p => webhookService.sendConfirmation(p));
      }
    } else if (payment.status === 'pending' && confirmations >= 1) {
      payment.status = 'confirming';
      payment.confirmingAt = new Date();
      await payment.save();
      console.log(
        `🔄 ETH confirming: ${payment.paymentId} (${confirmations}/${payment.requiredConfirmations} confirmation(s))`
      );
      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirming',
        details: { txHash: matchingTx.txHash, confirmations },
      });
    } else if (payment.status === 'confirming') {
      await payment.save();
    }
  }

  /**
   * Vérifie un paiement SOL en attente
   */
  async _checkSOLPayment(payment) {
    const minAccepted = payment.amount * (1 - config.solana.payment.amountTolerance);

    const balance = await solanaService.getBalance(payment.wallet.address);
    if (balance < minAccepted) return;

    const txs = await solanaService.getIncomingTransactions(
      payment.wallet.address,
      payment.createdAt.getTime()
    );
    const matchingTx = txs.find(tx => tx.amount >= minAccepted);
    if (!matchingTx) return;

    const confirmations = await solanaService.getTransactionConfirmations(matchingTx.txHash);

    payment.confirmations = confirmations;
    payment.txHash = payment.txHash || matchingTx.txHash;
    payment.receivedAmount = payment.receivedAmount || balance;

    if (confirmations >= payment.requiredConfirmations) {
      payment.status = 'confirmed';
      payment.sweepStatus = 'pending';
      await payment.save();
      console.log(
        `✅ SOL confirmé: ${payment.paymentId} (tx: ${matchingTx.txHash})`
      );

      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirmed',
        details: { txHash: matchingTx.txHash, confirmations },
      });

      try {
        await webhookService.sendConfirmation(payment);
      } catch (webhookErr) {
        console.error(`⚠️ Webhook SOL initial échoué, retry planifié: ${webhookErr.message}`);
        retryService.scheduleWebhookRetry(payment, p => webhookService.sendConfirmation(p));
      }
    } else if (payment.status === 'pending' && confirmations >= 1) {
      payment.status = 'confirming';
      payment.confirmingAt = new Date();
      await payment.save();
      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_confirming',
        details: { txHash: matchingTx.txHash, confirmations },
      });
    } else if (payment.status === 'confirming') {
      await payment.save();
    }
  }

  /**
   * Traite les sweeps en attente
   * @param {'BTC'|'USDT'} currency
   */
  async _processSweeps(currency) {
    const toSweep = await Payment.find({
      status: 'confirmed',
      sweepStatus: 'pending',
      currency: currency === 'BTC' ? 'BTC' : { $ne: 'BTC' },
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
        } else if (payment.currency === 'ETH') {
          await this._sweepETHPayment(payment, privateKey);
        } else if (payment.currency === 'SOL') {
          await this._sweepSOLPayment(payment, privateKey);
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
          if (payment.currency === 'ETH') {
            const { txHash } = await ethService.sweepETH(
              decryptedKey,
              addr,
              config.eth.centralWallet.address,
              config.eth.feesWalletAddress,
              config.fees.percentage
            );
            return txHash;
          }
          if (payment.currency === 'SOL') {
            const { txHash } = await solanaService.sweepSOL(
              decryptedKey,
              addr,
              config.solana.centralWallet.address,
              config.solana.feesWalletAddress,
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

  /**
   * Effectue le sweep d'un paiement ETH
   */
  async _sweepETHPayment(payment, privateKey) {
    const feesWalletAddress = config.eth.feesWalletAddress || null;
    const feesPercentage = feesWalletAddress && config.fees.percentage > 0
      ? config.fees.percentage
      : 0;

    const { txHash, feesAmount } = await ethService.sweepETH(
      privateKey,
      payment.wallet.address,
      config.eth.centralWallet.address,
      feesWalletAddress,
      feesPercentage
    );

    payment.sweepTxHash = txHash;
    payment.feesAmount = feesAmount > 0 ? feesAmount : null;
    payment.feesTxHash = null; // fees dans une tx séparée mais on trace le txHash principal
    payment.sweepStatus = 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash },
    });
    console.log(`✅ Sweep ETH terminé: ${payment.paymentId} → tx: ${txHash}`);
    await webhookService.sendSweepCompleted(payment);
  }

  /**
   * Effectue le sweep d'un paiement SOL
   */
  async _sweepSOLPayment(payment, privateKey) {
    const feesWalletAddress = config.solana.feesWalletAddress || null;
    const feesPercentage = feesWalletAddress && config.fees.percentage > 0
      ? config.fees.percentage
      : 0;

    const { txHash, feesAmount } = await solanaService.sweepSOL(
      privateKey,
      payment.wallet.address,
      config.solana.centralWallet.address,
      feesWalletAddress,
      feesPercentage
    );

    payment.sweepTxHash = txHash;
    payment.feesAmount = feesAmount > 0 ? feesAmount : null;
    payment.feesTxHash = null;
    payment.sweepStatus = 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash },
    });
    console.log(`✅ Sweep SOL terminé: ${payment.paymentId} → tx: ${txHash}`);
    await webhookService.sendSweepCompleted(payment);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new PaymentMonitor();
