const express = require('express');
const router = express.Router();
const WebhookService = require('../services/webhookService');

/**
 * POST /api/internal/payment-confirmed
 * Endpoint interne qui reçoit les webhooks de confirmation
 * C'est ici que tu brancheras ta logique métier
 */
router.post('/payment-confirmed', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const eventHeader = req.headers['x-webhook-event'];

  // Vérifier la signature
  if (!signature || !WebhookService.constructor.verifySignature) {
    // En interne on peut être plus souple, mais on log
    console.log(`📥 Webhook reçu: ${eventHeader}`, req.body);
  }

  const { event, paymentId } = req.body;

  // =====================================================
  // 👇 BRANCHE TA LOGIQUE MÉTIER ICI 👇
  // =====================================================

  if (event === 'payment.confirmed') {
    const { amount, receivedAmount, txHash, metadata } = req.body;
    console.log(`✅ [WEBHOOK] Paiement confirmé: ${paymentId}`);
    console.log(`   Montant attendu: ${amount} USDT`);
    console.log(`   Montant reçu: ${receivedAmount} USDT`);
    console.log(`   TX Hash: ${txHash}`);
    console.log(`   Metadata:`, metadata);
  } else if (event === 'payment.swept') {
    const { amount, sweepTxHash } = req.body;
    console.log(`✅ [WEBHOOK] Sweep complété: ${paymentId}`);
    console.log(`   Montant sweepé: ${amount} USDT`);
    console.log(`   Sweep TX Hash: ${sweepTxHash}`);
  } else {
    console.log(`📥 [WEBHOOK] Événement inconnu: ${event}`, req.body);
  }

  return res.json({ received: true });
});

module.exports = router;
