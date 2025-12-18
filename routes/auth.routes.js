const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validateLogin } = require('../middleware/validation');
const { authenticateToken } = require('../middleware/auth');

// Admin/Manager login
router.post('/login', validateLogin, authController.login);

// Refresh token
router.post('/refresh', authController.refresh);

// Courier login (phone only)
router.post('/courier-login', authController.courierLogin);

// Courier login (ID number) ← הוסף את זה!
router.post('/courier-login-id', authController.courierLoginById);

// Logout
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;