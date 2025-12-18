const express = require('express');
const router = express.Router();
const paymentsController = require('../controllers/payments.controller');
const { authenticateToken, requireAdmin, authenticateCourier } = require('../middleware/auth');
const { validatePayoutRequest } = require('../middleware/validation');

// Courier routes
router.post('/payout-request', authenticateCourier, validatePayoutRequest, paymentsController.createPayoutRequest);
router.get('/my-requests', authenticateCourier, paymentsController.getMyPayoutRequests);

// Admin routes
router.get('/requests', authenticateToken, requireAdmin, paymentsController.getAllPayoutRequests);
router.post('/requests/:id/approve', authenticateToken, requireAdmin, paymentsController.approvePayoutRequest);
router.post('/requests/:id/complete', authenticateToken, requireAdmin, paymentsController.completePayoutRequest);
router.post('/requests/:id/reject', authenticateToken, requireAdmin, paymentsController.rejectPayoutRequest);
router.post('/manual', authenticateToken, requireAdmin, paymentsController.recordManualPayment);
router.get('/history', authenticateToken, requireAdmin, paymentsController.getPaymentHistory);

module.exports = router;