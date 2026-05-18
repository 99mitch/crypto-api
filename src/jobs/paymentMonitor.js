const { ethers } = require('ethers');
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

const LAMPORTS_PER_SOL = 1_000_000_000;

function _getPayoutSplit(payment) {
  const md = payment.metadata || {};
  const split = Array.isArray(md.payoutSplit) ? md.payoutSplit : [];
  return split.filter((s) => s && s.address && s.ratio > 0);
}

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

    // Expirer les paiements BTC/ETH bloqués en 'confirming' depuis plus de 24h
    const confirmingCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stalledConfirming = await Payment.find({
      status: 'confirming',
      currency: { $in: ['BTC', 'ETH'] },
      confirmingAt: { $lt: confirmingCutoff },
    });

    for (const payment of stalledConfirming) {
      payment.status = 'expired';
      await payment.save();
      console.log(`⏰ BTC paiement confirming expiré (>24h): ${payment.paymentId}`);
      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'payment_expired',
        details: { reason: 'confirming_timeout_24h' },
      });
    }
  }

  /**
   * Vérifie les paiements en attente et les paiements BTC en cours de confirmation
   */
  async _checkPendingPayments() {
    const graceCutoff = new Date(Date.now() - config.payment.gracePeriodSeconds * 1000);

    const confirmingCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Inclut les paiements BTC/ETH 'confirming' (attente de confirmations supplémentaires)
    // Les paiements confirming de plus de 24h sont ignorés (tx probablement droppée du mempool)
    const paymentsToCheck = await Payment.find({
      $or: [
        { status: 'pending', expiresAt: { $gt: graceCutoff } },
        {
          status: 'confirming',
          currency: { $in: ['BTC', 'ETH'] },
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
   * Vérifie un paiement ETH (gère pending → confirming → confirmed)
   */
  async _checkETHPayment(payment) {
    const minAccepted = payment.amount * (1 - config.eth.payment.amountTolerance);

    const balance = await ethService.getBalance(payment.wallet.address);
    if (balance < minAccepted) return;

    const txs = await ethService.getIncomingTransactions(payment.wallet.address, payment.createdAt.getTime());
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
   * Vérifie un paiement SOL en attente (1 confirmation suffit)
   */
  async _checkSOLPayment(payment) {
    const minAccepted = payment.amount * (1 - config.solana.payment.amountTolerance);

    const balance = await solanaService.getBalance(payment.wallet.address);

    if (balance >= minAccepted) {
      const isOverpaid = balance > payment.amount;
      const isLate = new Date() > payment.expiresAt;
      console.log(
        `✅ Paiement SOL reçu: ${payment.paymentId} - ${balance}/${payment.amount} SOL` +
        `${isOverpaid ? ' (sur-paiement)' : ''}${isLate ? ' (tardif)' : ''}`
      );

      const txs = await solanaService.getIncomingTransactions(
        payment.wallet.address,
        payment.createdAt.getTime()
      );
      const matchingTx = txs.find(tx => tx.amount >= minAccepted);

      payment.status = 'confirmed';
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

      try {
        await webhookService.sendConfirmation(payment);
      } catch (webhookErr) {
        console.error(`⚠️ Webhook SOL initial échoué, retry planifié: ${webhookErr.message}`);
        retryService.scheduleWebhookRetry(payment, p => webhookService.sendConfirmation(p));
      }
    } else if (balance > 0 && balance < minAccepted) {
      console.log(
        `⚠️ Montant SOL partiel: ${payment.paymentId} - ${balance}/${payment.amount} SOL`
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
   * Effectue le sweep d'un paiement USDT (avec support payoutSplit multi-destinations)
   */
  async _sweepUSDTPayment(payment, privateKey) {
    const actualBalance = await tronService.getUSDTBalance(payment.wallet.address);
    const sweepTotal = Math.floor(actualBalance * 1e6) / 1e6;

    const split = _getPayoutSplit(payment);
    const hasFees = config.fees.walletAddress && config.fees.percentage > 0;

    // Pré-calcul des montants collab (en USDT, précision 6 décimales)
    const collabAmounts = split.map((s) => ({
      ...s,
      amount: Math.floor(sweepTotal * s.ratio * 1e6) / 1e6,
    }));
    const collabSum = collabAmounts.reduce((a, c) => a + c.amount, 0);

    // Frais calculés sur le reste (après collabs)
    const afterCollabs = Math.max(0, sweepTotal - collabSum);
    const feesAmount = hasFees
      ? Math.floor(afterCollabs * config.fees.percentage * 1e6) / 1e6
      : 0;
    const centralAmount = Math.floor((afterCollabs - feesAmount) * 1e6) / 1e6;

    const nbTransfers =
      collabAmounts.length + (centralAmount > 0 ? 1 : 0) + (hasFees && feesAmount > 0 ? 1 : 0);

    // Gas TRX (la plateforme couvre, négligeable)
    await tronService.ensureGasForSweep(payment.wallet.address, nbTransfers);

    const payoutResults = [];
    for (const c of collabAmounts) {
      if (c.amount <= 0) {
        payoutResults.push({ ...c, status: 'failed', error: 'amount too small' });
        continue;
      }
      try {
        const txHash = await tronService.sweepUSDT(
          privateKey,
          payment.wallet.address,
          c.amount,
          c.address
        );
        payoutResults.push({
          collabId: c.collabId,
          address: c.address,
          amount: c.amount,
          currency: 'USDT',
          txHash,
          status: 'success',
        });
        await this._sleep(2000);
      } catch (err) {
        payoutResults.push({
          collabId: c.collabId,
          address: c.address,
          amount: c.amount,
          currency: 'USDT',
          txHash: null,
          status: 'failed',
          error: err.message,
        });
      }
    }

    let feesTxHash = null;
    if (hasFees && feesAmount > 0) {
      console.log(`💰 Frais: ${feesAmount} USDT (${config.fees.percentage * 100}%) → fees wallet`);
      feesTxHash = await tronService.sweepUSDT(
        privateKey,
        payment.wallet.address,
        feesAmount,
        config.fees.walletAddress
      );
      await this._sleep(2000);
    }

    let sweepTxHash = null;
    if (centralAmount > 0) {
      sweepTxHash = await tronService.sweepUSDT(
        privateKey,
        payment.wallet.address,
        centralAmount,
        config.tron.centralWallet.address
      );
    }

    const anyCollabFailed = payoutResults.some((r) => r.status === 'failed');
    payment.sweepTxHash = sweepTxHash;
    payment.feesAmount = feesAmount > 0 ? feesAmount : null;
    payment.feesTxHash = feesTxHash;
    payment.payoutResults = payoutResults;
    payment.sweepStatus = anyCollabFailed ? 'partial' : 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash: sweepTxHash, payouts: payoutResults.length },
    });

    console.log(`✅ Sweep USDT terminé: ${payment.paymentId} → central tx: ${sweepTxHash}, ${payoutResults.length} payouts collab`);
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

    const split = _getPayoutSplit(payment);
    if (split.length === 0) {
      // Comportement original (pas de split)
      const { txHash, feesTxHash, feesAmount } = await ethService.sweepETH(
        privateKey,
        payment.wallet.address,
        config.eth.centralWallet.address,
        feesWalletAddress,
        feesPercentage
      );
      payment.sweepTxHash = txHash;
      payment.feesAmount = feesAmount || null;
      payment.feesTxHash = feesTxHash || null;
      payment.payoutResults = [];
      payment.sweepStatus = 'completed';
      payment.status = 'swept';
      await payment.save();
      await AuditLog.log({ paymentId: payment.paymentId, action: 'sweep_completed', details: { txHash } });
      console.log(`✅ Sweep ETH terminé: ${payment.paymentId} → tx: ${txHash}`);
      await webhookService.sendSweepCompleted(payment);
      return;
    }

    // Split path : N transferts collab + central + (optionnel) fees
    const provider = ethService._getProvider();
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
    const gasCostWei = gasPrice * 21000n;

    const balanceWei = await provider.getBalance(payment.wallet.address);
    const hasFees = feesPercentage > 0;
    const nbTxs = BigInt(split.length) + 1n + (hasFees ? 1n : 0n);
    const totalGasWei = gasCostWei * nbTxs;

    if (balanceWei <= totalGasWei) {
      throw new Error(`Solde ETH insuffisant pour couvrir le gas de ${nbTxs} transferts`);
    }

    const payoutResults = [];
    let consumedWei = 0n;

    for (const dest of split) {
      // Part brute du collab (proportionnelle au solde reçu)
      const ratioBps = BigInt(Math.round(dest.ratio * 1_000_000));
      const grossWei = (balanceWei * ratioBps) / 1_000_000n;
      // Collab paye son gas → on déduit
      const netWei = grossWei - gasCostWei;
      if (netWei <= 0n) {
        payoutResults.push({
          collabId: dest.collabId,
          address: dest.address,
          amount: 0,
          currency: 'ETH',
          txHash: null,
          status: 'failed',
          error: 'amount too small to cover gas',
        });
        continue;
      }
      try {
        const txHash = await ethService.sendETH(privateKey, dest.address, netWei, gasPrice);
        consumedWei += grossWei;
        payoutResults.push({
          collabId: dest.collabId,
          address: dest.address,
          amount: parseFloat(ethers.formatEther(netWei)),
          currency: 'ETH',
          txHash,
          status: 'success',
        });
      } catch (err) {
        payoutResults.push({
          collabId: dest.collabId,
          address: dest.address,
          amount: parseFloat(ethers.formatEther(netWei)),
          currency: 'ETH',
          txHash: null,
          status: 'failed',
          error: err.message,
        });
      }
    }

    // Restant pour central (+ fees éventuels)
    const remainingWei = await provider.getBalance(payment.wallet.address);
    const reservedGasWei = gasCostWei * (hasFees ? 2n : 1n);
    if (remainingWei <= reservedGasWei) {
      throw new Error('Solde restant insuffisant après payouts collab');
    }
    const availableForCentralWei = remainingWei - reservedGasWei;
    const feesBps = BigInt(Math.round(feesPercentage * 10000));
    const feesWei = hasFees ? (availableForCentralWei * feesBps) / 10000n : 0n;
    const centralWei = availableForCentralWei - feesWei;

    let feesTxHash = null;
    let feesAmount = null;
    if (hasFees && feesWei > 0n) {
      feesTxHash = await ethService.sendETH(privateKey, feesWalletAddress, feesWei, gasPrice);
      feesAmount = parseFloat(ethers.formatEther(feesWei));
    }
    const sweepTxHash = await ethService.sendETH(
      privateKey,
      config.eth.centralWallet.address,
      centralWei,
      gasPrice
    );

    const anyCollabFailed = payoutResults.some((r) => r.status === 'failed');
    payment.sweepTxHash = sweepTxHash;
    payment.feesAmount = feesAmount;
    payment.feesTxHash = feesTxHash;
    payment.payoutResults = payoutResults;
    payment.sweepStatus = anyCollabFailed ? 'partial' : 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash: sweepTxHash, payouts: payoutResults.length },
    });
    console.log(`✅ Sweep ETH terminé: ${payment.paymentId} → central tx: ${sweepTxHash}, ${payoutResults.length} payouts collab`);
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

    const split = _getPayoutSplit(payment);
    if (split.length === 0) {
      // Comportement original (pas de split)
      const { txHash, feesTxHash, feesAmount } = await solanaService.sweepSOL(
        privateKey,
        payment.wallet.address,
        config.solana.centralWallet.address,
        feesWalletAddress,
        feesPercentage
      );
      payment.sweepTxHash = txHash;
      payment.feesAmount = feesAmount || null;
      payment.feesTxHash = feesTxHash || null;
      payment.payoutResults = [];
      payment.sweepStatus = 'completed';
      payment.status = 'swept';
      await payment.save();
      await AuditLog.log({ paymentId: payment.paymentId, action: 'sweep_completed', details: { txHash } });
      console.log(`✅ Sweep SOL terminé: ${payment.paymentId} → tx: ${txHash}`);
      await webhookService.sendSweepCompleted(payment);
      return;
    }

    // Split path
    const connection = solanaService._getConnection();
    const TX_FEE_LAMPORTS = 5000;
    const balanceLamports = await connection.getBalance(
      new (require('@solana/web3.js').PublicKey)(payment.wallet.address)
    );

    const hasFees = feesPercentage > 0;
    const nbTxs = split.length + 1 + (hasFees ? 1 : 0);
    const totalGas = TX_FEE_LAMPORTS * nbTxs;

    if (balanceLamports <= totalGas) {
      throw new Error(`Solde SOL insuffisant pour couvrir le gas de ${nbTxs} transferts`);
    }

    const payoutResults = [];
    for (const dest of split) {
      const grossLamports = Math.floor(balanceLamports * dest.ratio);
      const netLamports = grossLamports - TX_FEE_LAMPORTS;
      if (netLamports <= 0) {
        payoutResults.push({
          collabId: dest.collabId,
          address: dest.address,
          amount: 0,
          currency: 'SOL',
          txHash: null,
          status: 'failed',
          error: 'amount too small to cover gas',
        });
        continue;
      }
      try {
        const txHash = await solanaService.sendSOL(
          privateKey,
          payment.wallet.address,
          dest.address,
          netLamports
        );
        payoutResults.push({
          collabId: dest.collabId,
          address: dest.address,
          amount: netLamports / LAMPORTS_PER_SOL,
          currency: 'SOL',
          txHash,
          status: 'success',
        });
      } catch (err) {
        payoutResults.push({
          collabId: dest.collabId,
          address: dest.address,
          amount: netLamports / LAMPORTS_PER_SOL,
          currency: 'SOL',
          txHash: null,
          status: 'failed',
          error: err.message,
        });
      }
    }

    // Restant pour central (+ fees)
    const remainingLamports = await connection.getBalance(
      new (require('@solana/web3.js').PublicKey)(payment.wallet.address)
    );
    const reservedGas = TX_FEE_LAMPORTS * (hasFees ? 2 : 1);
    if (remainingLamports <= reservedGas) {
      throw new Error('Solde SOL restant insuffisant après payouts collab');
    }
    const availableForCentral = remainingLamports - reservedGas;
    const feesLamports = hasFees ? Math.floor(availableForCentral * feesPercentage) : 0;
    const centralLamports = availableForCentral - feesLamports;

    let feesTxHash = null;
    let feesAmount = null;
    if (hasFees && feesLamports > 0) {
      feesTxHash = await solanaService.sendSOL(
        privateKey,
        payment.wallet.address,
        feesWalletAddress,
        feesLamports
      );
      feesAmount = feesLamports / LAMPORTS_PER_SOL;
    }
    const sweepTxHash = await solanaService.sendSOL(
      privateKey,
      payment.wallet.address,
      config.solana.centralWallet.address,
      centralLamports
    );

    const anyCollabFailed = payoutResults.some((r) => r.status === 'failed');
    payment.sweepTxHash = sweepTxHash;
    payment.feesAmount = feesAmount;
    payment.feesTxHash = feesTxHash;
    payment.payoutResults = payoutResults;
    payment.sweepStatus = anyCollabFailed ? 'partial' : 'completed';
    payment.status = 'swept';
    await payment.save();

    await AuditLog.log({
      paymentId: payment.paymentId,
      action: 'sweep_completed',
      details: { txHash: sweepTxHash, payouts: payoutResults.length },
    });
    console.log(`✅ Sweep SOL terminé: ${payment.paymentId} → central tx: ${sweepTxHash}, ${payoutResults.length} payouts collab`);
    await webhookService.sendSweepCompleted(payment);
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new PaymentMonitor();
