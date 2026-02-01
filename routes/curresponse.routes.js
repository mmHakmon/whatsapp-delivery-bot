const express = require('express');
const router = express.Router();
const curresponseController = require('../controllers/curresponse.controller');
const { authenticateCustomer } = require('../middleware/auth');

// ==========================================
// VIP CUSTOMER ROUTES (Require Authentication)
// ==========================================

// Create VIP order
router.post('/order', authenticateCustomer, curresponseController.createVIPOrder);

// Get my orders
router.get('/orders', authenticateCustomer, curresponseController.getMyOrders);

// Get order by ID
router.get('/orders/:id', authenticateCustomer, curresponseController.getOrderById);

// ==========================================
// ADMIN ROUTES (For managing VIP orders)
// ==========================================

// Update waiting fee (admin only)
router.put('/orders/:orderId/waiting-fee', curresponseController.updateWaitingFee);

module.exports = router;
