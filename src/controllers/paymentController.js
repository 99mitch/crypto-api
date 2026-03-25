const paymentService = require('../services/paymentService');

class PaymentController {
  /**
   * POST /api/payments
   * Créer une nouvelle demande de paiement
   */
  async create(req, res) {
    try {
      const { amount, metadata, description, externalRef } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Montant invalide. Doit être > 0.' });
      }

      if (amount < 0.01) {
        return res.status(400).json({ error: 'Montant minimum: 0.01 USDT' });
      }

      const payment = await paymentService.createPayment(amount, {
        metadata,
        description,
        externalRef,
      }, req);

      return res.status(201).json({
        success: true,
        payment,
      });
    } catch (error) {
      console.error('Erreur création paiement:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/payments/:paymentId
   * Récupérer un paiement
   */
  async getOne(req, res) {
    try {
      const payment = await paymentService.getPayment(req.params.paymentId);

      if (!payment) {
        return res.status(404).json({ error: 'Paiement non trouvé' });
      }

      return res.json({ success: true, payment });
    } catch (error) {
      console.error('Erreur récupération paiement:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/payments/:paymentId/status
   * Vérifier le statut (endpoint léger pour le polling côté front)
   */
  async getStatus(req, res) {
    try {
      const payment = await paymentService.getPayment(req.params.paymentId);

      if (!payment) {
        return res.status(404).json({ error: 'Paiement non trouvé' });
      }

      return res.json({
        paymentId: payment.paymentId,
        status: payment.status,
        receivedAmount: payment.receivedAmount,
        expiresAt: payment.expiresAt,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * POST /api/payments/:paymentId/cancel
   * Annuler un paiement
   */
  async cancel(req, res) {
    try {
      const payment = await paymentService.cancelPayment(req.params.paymentId);

      if (!payment) {
        return res.status(404).json({
          error: 'Paiement non trouvé ou non annulable (seul un paiement pending peut être annulé)',
        });
      }

      return res.json({ success: true, payment });
    } catch (error) {
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }
}

module.exports = new PaymentController();
