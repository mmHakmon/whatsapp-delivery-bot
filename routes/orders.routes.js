const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');
const { authenticateToken, requireAdmin, authenticateCourier } = require('../middleware/auth');
const { validateOrder } = require('../middleware/validation');

// ==========================================
// PUBLIC ROUTES (לקוחות)
// ==========================================

// Track order by number (public)
router.get('/track/:orderNumber', ordersController.getOrderByNumber);

// Calculate pricing (public)
router.post('/calculate', ordersController.calculatePricingEndpoint);

// Create order from customer (public - NO AUTH!)
router.post('/public', validateOrder, ordersController.createOrderPublic);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Create order (admin/agent)
router.post('/', authenticateToken, validateOrder, ordersController.createOrder);
router.get('/', authenticateToken, ordersController.getOrders);
router.get('/statistics', authenticateToken, ordersController.getStatistics);
router.get('/:id', authenticateToken, ordersController.getOrderById);

// Publish order to WhatsApp
router.post('/:id/publish', authenticateToken, requireAdmin, ordersController.publishOrder);

// Cancel order
router.post('/:id/cancel', authenticateToken, requireAdmin, ordersController.cancelOrder);

// ==========================================
// COURIER ROUTES
// ==========================================

router.post('/:id/take', authenticateCourier, ordersController.takeOrder);
router.post('/:id/pickup', authenticateCourier, ordersController.pickupOrder);
router.post('/:id/deliver', authenticateCourier, ordersController.deliverOrder);

module.exports = router;
