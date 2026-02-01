const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');
const { authenticateToken, requireAdmin, authenticateCourier } = require('../middleware/auth');
const { validateOrderCreation } = require('../middleware/validation');

// ==========================================
// PUBLIC ROUTES (לקוחות)
// ==========================================

// Track order by number (public)
router.get('/track/:orderNumber', ordersController.getOrderByNumber);

// Calculate pricing (public)
router.post('/calculate', ordersController.calculatePricingEndpoint);

// Create order from customer (public - NO AUTH!)
router.post('/public', validateOrderCreation, ordersController.createOrderPublic);

// Quick take from WhatsApp link (NO AUTH!)
router.post('/quick-take/:orderId', ordersController.quickTakeOrder);

// ==========================================
// ✅ NEW: RATING ROUTES (PUBLIC - NO AUTH!)
// ==========================================
router.get('/:id/rating-status', ordersController.checkRatingStatus);
router.post('/:id/rate', ordersController.rateOrder);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Create order (admin/agent)
router.post('/', authenticateToken, validateOrderCreation, ordersController.createOrder);
router.get('/', authenticateToken, ordersController.getOrders);
router.get('/statistics', authenticateToken, ordersController.getStatistics);
router.get('/:id', authenticateToken, ordersController.getOrderById);

// Publish order to WhatsApp
router.post('/:id/publish', authenticateToken, requireAdmin, ordersController.publishOrder);

// Cancel order
router.post('/:id/cancel', authenticateToken, requireAdmin, ordersController.cancelOrder);
router.delete("/:id", authenticateToken, requireAdmin, ordersController.deleteOrder);

// ==========================================
// COURIER ROUTES
// ==========================================

router.post('/:id/take', authenticateCourier, ordersController.takeOrder);
router.post('/:id/pickup', authenticateCourier, ordersController.pickupOrder);
router.post('/:id/deliver', authenticateCourier, ordersController.deliverOrder);

module.exports = router;
