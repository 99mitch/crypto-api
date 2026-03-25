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
  const event = req.headers['x-webhook-event'];

  // Vérifier la signature
  if (!signature || !WebhookService.constructor.verifySignature) {
    // En interne on peut être plus souple, mais on log
    console.log(`📥 Webhook reçu: ${event}`, req.body);
  }

  const { paymentId, amount, receivedAmount, txHash, metadata } = req.body;

  // =====================================================
  // 👇 BRANCHE TA LOGIQUE MÉTIER ICI 👇
  // Exemples :
  //   - Activer un abonnement
  //   - Créditer le compte d'un utilisateur
  //   - Envoyer un email de confirmation
  //   - Mettre à jour une commande
  // =====================================================

  console.log(`✅ [WEBHOOK] Paiement confirmé: ${paymentId}`);
  console.log(`   Montant attendu: ${amount} USDT`);
  console.log(`   Montant reçu: ${receivedAmount} USDT`);
  console.log(`   TX Hash: ${txHash}`);
  console.log(`   Metadata:`, metadata);

  return res.json({ received: true });
});

module.exports = router;
