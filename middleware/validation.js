const { body, validationResult } = require('express-validator');

// Validation error handler
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// Order validation rules
const validateOrder = [
  body('senderName').trim().notEmpty().withMessage('Sender name is required'),
  body('senderPhone').trim().matches(/^[0-9]{9,10}$/).withMessage('Valid phone number required'),
  body('pickupAddress').trim().notEmpty().withMessage('Pickup address is required'),
  body('receiverName').trim().notEmpty().withMessage('Receiver name is required'),
  body('receiverPhone').trim().matches(/^[0-9]{9,10}$/).withMessage('Valid phone number required'),
  body('deliveryAddress').trim().notEmpty().withMessage('Delivery address is required'),
  body('vehicleType').optional().isIn(['motorcycle', 'car', 'van', 'truck']),
  handleValidationErrors
];

// Login validation rules
const validateLogin = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

// Courier registration validation
const validateCourierRegistration = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('idNumber').trim().matches(/^[0-9]{9}$/).withMessage('Valid ID number required'),
  body('phone').trim().matches(/^[0-9]{9,10}$/).withMessage('Valid phone number required'),
  body('vehicleType').isIn(['motorcycle', 'car', 'van', 'truck']).withMessage('Valid vehicle type required'),
  handleValidationErrors
];

// Payout request validation
const validatePayoutRequest = [
  body('amount').isFloat({ min: 50 }).withMessage('Minimum payout is ₪50'),
  body('paymentMethod').isIn(['bank_transfer', 'bit', 'cash']).withMessage('Valid payment method required'),
  body('accountInfo').notEmpty().withMessage('Account information is required'),
  handleValidationErrors
];

module.exports = {
  validateOrder,
  validateLogin,
  validateCourierRegistration,
  validatePayoutRequest
};