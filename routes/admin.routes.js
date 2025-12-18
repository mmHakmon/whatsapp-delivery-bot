const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

// ==========================================
// USER MANAGEMENT
// ==========================================
router.post('/users', adminController.createUser);
router.get('/users', adminController.getUsers);
router.put('/users/:id', adminController.updateUser);
router.put('/users/:id/password', adminController.changePassword);
router.delete('/users/:id', adminController.deleteUser);

// ==========================================
// DASHBOARD & STATISTICS
// ==========================================
router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/revenue-by-period', adminController.getRevenueByPeriod);
router.get('/top-couriers', adminController.getTopCouriers);
router.get('/orders-by-status', adminController.getOrdersByStatus);

// ==========================================
// EXPORTS
// ==========================================
router.get('/export/orders', adminController.exportOrders);
router.get('/export/couriers', adminController.exportCouriers);
router.get('/export/payments', adminController.exportPayments);

// ==========================================
// ACTIVITY LOG
// ==========================================
router.post('/activity-log', adminController.logActivity);
router.get('/activity-log', adminController.getActivityLog);

// ==========================================
// SETTINGS
// ==========================================
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSetting);

// ==========================================
// MAINTENANCE
// ==========================================
router.post('/cleanup', adminController.cleanupOldData);
router.get('/database-stats', adminController.getDatabaseStats);


// Settings panel actions
router.post('/reset-statistics', adminController.resetStatistics);
router.post('/delete-old-orders', adminController.deleteOldOrders);
router.post('/archive-delivered', adminController.archiveDelivered);
module.exports = router;
