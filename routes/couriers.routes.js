const express = require('express');
const router = express.Router();
const couriersController = require('../controllers/couriers.controller');
const { authenticateToken, requireAdmin, authenticateCourier } = require('../middleware/auth');
const { validateCourierRegistration } = require('../middleware/validation');

// Public routes
router.post('/register', validateCourierRegistration, couriersController.registerCourier);

// Courier routes
router.get('/me', authenticateCourier, couriersController.getMyProfile);
router.put('/me', authenticateCourier, couriersController.updateProfile);
router.get('/my-orders', authenticateCourier, couriersController.getMyCourierOrders);
router.get('/available-orders', authenticateCourier, couriersController.getAvailableOrders);
router.get('/my-statistics', authenticateCourier, couriersController.getMyStatistics);
router.get('/earnings-breakdown', authenticateCourier, couriersController.getEarningsBreakdown);
router.post('/location', authenticateCourier, couriersController.updateLocation);

// Admin routes
router.get('/', authenticateToken, requireAdmin, couriersController.getCouriers);
router.get('/:id', authenticateToken, requireAdmin, couriersController.getCourierById);
router.put('/:id/status', authenticateToken, requireAdmin, couriersController.toggleCourierStatus);

module.exports = router;