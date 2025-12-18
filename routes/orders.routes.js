const express = require('express');
const router = express.Router();
const ordersController = require('../controllers/orders.controller');
const { authenticateToken, requireAdmin, authenticateCourier } = require('../middleware/auth');
const { validateOrder } = require('../middleware/validation');

// Public routes
router.get('/track/:orderNumber', ordersController.getOrderByNumber);

// Admin routes
router.post('/', authenticateToken, validateOrder, ordersController.createOrder);
router.get('/', authenticateToken, ordersController.getOrders);
router.get('/statistics', authenticateToken, ordersController.getStatistics);
router.get('/:id', authenticateToken, ordersController.getOrderById);
router.post('/:id/publish', authenticateToken, requireAdmin, ordersController.publishOrder);
router.post('/:id/cancel', authenticateToken, requireAdmin, ordersController.cancelOrder);

// Courier routes
router.post('/:id/take', authenticateCourier, ordersController.takeOrder);
router.post('/:id/pickup', authenticateCourier, ordersController.pickupOrder);
router.post('/:id/deliver', authenticateCourier, ordersController.deliverOrder);

module.exports = router;