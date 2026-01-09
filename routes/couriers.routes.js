const express = require('express');
const router = express.Router();
const couriersController = require('../controllers/couriers.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// ==========================================
// PUBLIC ROUTES
// ==========================================

// Register new courier
router.post('/register', couriersController.registerCourier);

// ==========================================
// COURIER ROUTES (require authentication)
// ==========================================

// Get courier profile
router.get('/me', authenticateToken, couriersController.getCourierProfile);

// Get available orders for courier
router.get('/available-orders', authenticateToken, couriersController.getAvailableOrders);

// Get courier's orders
router.get('/my-orders', authenticateToken, couriersController.getMyOrders);

// Get courier statistics
router.get('/my-statistics', authenticateToken, couriersController.getMyStatistics);

// Update courier location

// Advanced statistics & analytics
router.get('/advanced-statistics', authenticateToken, couriersController.getAdvancedStatistics);
router.get('/goals', authenticateToken, couriersController.getGoals);
router.get('/ranking', authenticateToken, couriersController.getRanking);
router.get('/earnings-projection', authenticateToken, couriersController.getEarningsProjection);
router.get('/performance-metrics', authenticateToken, couriersController.getPerformanceMetrics);

router.post('/location', authenticateToken, couriersController.updateLocation);

// ==========================================
// ADMIN ROUTES
// ==========================================

// Get all couriers
router.get('/', authenticateToken, requireAdmin, couriersController.getCouriers);

// Get courier by ID
router.get('/:id', authenticateToken, requireAdmin, couriersController.getCourierById);

// Update courier status
router.put('/:id/status', authenticateToken, requireAdmin, couriersController.updateCourierStatus);

// Delete courier
router.delete('/:id', authenticateToken, requireAdmin, couriersController.deleteCourier);

module.exports = router;
