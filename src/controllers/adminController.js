const paymentService = require('../services/paymentService');
const Payment = require('../models/Payment');
const AuditLog = require('../models/AuditLog');
const paymentMonitor = require('../jobs/paymentMonitor');

class AdminController {
  /**
   * GET /api/admin/payments
   * Liste paginée des paiements avec filtres
   */
  async listPayments(req, res) {
    try {
      const { status, page, limit, from, to } = req.query;
      const result = await paymentService.listPayments({
        status,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        from,
        to,
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erreur listPayments:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/admin/payments/:paymentId
   * Détail admin d'un paiement
   */
  async getPayment(req, res) {
    try {
      const [payment, history] = await Promise.all([
        paymentService.getPaymentAdmin(req.params.paymentId),
        AuditLog.getPaymentHistory(req.params.paymentId),
      ]);
      if (!payment) {
        return res.status(404).json({ error: 'Paiement non trouvé' });
      }

      return res.json({ success: true, payment, history });
    } catch (error) {
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/admin/payments/:paymentId/history
   * Historique complet d'un paiement (audit trail)
   */
  async getPaymentHistory(req, res) {
    try {
      const history = await AuditLog.getPaymentHistory(req.params.paymentId);
      return res.json({ success: true, history });
    } catch (error) {
      console.error('Erreur getPaymentHistory:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/admin/stats
   * Statistiques globales
   */
  async getStats(req, res) {
    try {
      const stats = await paymentService.getStats();
      return res.json({ success: true, stats });
    } catch (error) {
      console.error('Erreur getStats:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * POST /api/admin/payments/:paymentId/retry-sweep
   * Relancer un sweep échoué
   */
  async retrySweep(req, res) {
    try {
      const payment = await Payment.findOne({
        paymentId: req.params.paymentId,
        sweepStatus: 'failed',
      });

      if (!payment) {
        return res.status(404).json({
          error: 'Paiement non trouvé ou sweep non en échec',
        });
      }

      payment.sweepStatus = 'pending';
      await payment.save();

      await AuditLog.log({
        paymentId: payment.paymentId,
        action: 'admin_retry_sweep',
        req,
      });

      // Déclencher un run immédiat du monitor
      paymentMonitor.run();

      return res.json({
        success: true,
        message: `Sweep relancé pour ${payment.paymentId}`,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/admin/recent-activity
   * Dernières activités (pour le feed en temps réel du dashboard)
   */
  async recentActivity(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const payments = await Payment.find()
        .sort({ updatedAt: -1 })
        .limit(limit)
        .select('paymentId amount status receivedAmount createdAt updatedAt');

      return res.json({
        success: true,
        activities: payments.map((p) => ({
          paymentId: p.paymentId,
          amount: p.amount,
          status: p.status,
          receivedAmount: p.receivedAmount,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      });
    } catch (error) {
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/admin/stats/daily
   * Breakdown journalier sur N jours (défaut: 7)
   * Remplace les N requêtes parallèles du dashboard par une seule
   */
  async getDailyStats(req, res) {
    try {
      const days = Math.min(parseInt(req.query.days) || 7, 90);
      const status = req.query.status || 'swept';

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - (days - 1));

      const rows = await Payment.aggregate([
        { $match: { status, createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz },
            },
            revenue: { $sum: '$receivedAmount' },
            count:   { $sum: 1 },
          },
        },
      ]);

      const byDate = Object.fromEntries(rows.map(r => [r._id, r]));

      const results = Array.from({ length: days }, (_, i) => {
        const d = new Date(since);
        d.setDate(since.getDate() + i);
        const date = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0'),
        ].join('-');
        return { date, revenue: byDate[date]?.revenue || 0, count: byDate[date]?.count || 0 };
      });

      return res.json({ success: true, days: results });
    } catch (error) {
      console.error('Erreur getDailyStats:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/admin/audit-logs
   * Recherche dans les logs d'audit
   */
  async getAuditLogs(req, res) {
    try {
      const { paymentId, action, level, from, to, page, limit } = req.query;
      const result = await AuditLog.search({
        paymentId,
        action,
        level,
        from,
        to,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Erreur getAuditLogs:', error);
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }

  /**
   * GET /api/admin/audit-logs/stats
   * Stats des logs d'audit
   */
  async getAuditLogStats(req, res) {
    try {
      const hours = parseInt(req.query.hours) || 24;
      const stats = await AuditLog.getStats(hours);
      return res.json({ success: true, stats });
    } catch (error) {
      return res.status(500).json({ error: 'Erreur interne' });
    }
  }
}

module.exports = new AdminController();
