const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminAuth, adminLogin } = require('../middleware/adminAuth');
const { adminLimiter } = require('../middleware/rateLimiter');

// Login (pas besoin d'auth)
router.post('/login', adminLogin);

// ===== Toutes les routes suivantes requièrent l'authentification admin =====
router.use(adminAuth);
router.use(adminLimiter);

// Stats globales
router.get('/stats', adminController.getStats);

// Liste des paiements
router.get('/payments', adminController.listPayments);

// Détail d'un paiement
router.get('/payments/:paymentId', adminController.getPayment);

// Historique audit d'un paiement
router.get('/payments/:paymentId/history', adminController.getPaymentHistory);

// Relancer un sweep
router.post('/payments/:paymentId/retry-sweep', adminController.retrySweep);

// Activité récente
router.get('/recent-activity', adminController.recentActivity);

// ===== Audit Logs =====
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/audit-logs/stats', adminController.getAuditLogStats);

module.exports = router;
