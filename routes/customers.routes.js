const express = require('express');
const router = express.Router();
const customersController = require('../controllers/customers.controller');
const { authenticateCustomer } = require('../middleware/auth');

// ==========================================
// PUBLIC ROUTES (Registration & Login)
// ==========================================

// Register new customer
router.post('/register', customersController.register);

// Login customer
router.post('/login', customersController.login);

// ==========================================
// PROTECTED ROUTES (Require Authentication)
// ==========================================

// Get customer profile
router.get('/profile', authenticateCustomer, customersController.getProfile);

// Update customer profile
router.put('/profile', authenticateCustomer, customersController.updateProfile);

// Update notification settings
router.put('/notifications', authenticateCustomer, customersController.updateNotificationSettings);

// Change password
router.post('/change-password', authenticateCustomer, customersController.changePassword);

// Get statistics
router.get('/statistics', authenticateCustomer, customersController.getStatistics);

// Get order history
router.get('/orders', authenticateCustomer, customersController.getOrderHistory);

// Get support info
router.get('/support', authenticateCustomer, customersController.getSupport);

module.exports = router;
