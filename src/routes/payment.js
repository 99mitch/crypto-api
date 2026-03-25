const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { paymentCreateLimiter, statusPollLimiter } = require('../middleware/rateLimiter');

// Créer un paiement (rate limité : 10/min)
router.post('/', paymentCreateLimiter, paymentController.create);

// Récupérer un paiement
router.get('/:paymentId', paymentController.getOne);

// Vérifier le statut — polling (rate limité : 30/min)
router.get('/:paymentId/status', statusPollLimiter, paymentController.getStatus);

// Annuler un paiement
router.post('/:paymentId/cancel', paymentController.cancel);

module.exports = router;
