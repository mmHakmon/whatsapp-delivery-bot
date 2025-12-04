const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  
  // Log error
  logger.error(`${err.statusCode} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  
  if (process.env.NODE_ENV === 'development') {
    logger.error(err.stack);
  }

  // Handle specific error types
  if (err.code === '23505') { // PostgreSQL unique violation
    err.statusCode = 409;
    err.message = 'כבר קיים רשומה עם נתונים אלו';
  }

  if (err.code === '23503') { // PostgreSQL foreign key violation
    err.statusCode = 400;
    err.message = 'הפניה לנתונים שאינם קיימים';
  }

  if (err.name === 'JsonWebTokenError') {
    err.statusCode = 401;
    err.message = 'טוקן לא תקין';
  }

  if (err.name === 'TokenExpiredError') {
    err.statusCode = 401;
    err.message = 'טוקן פג תוקף';
  }

  if (err.name === 'ValidationError') {
    err.statusCode = 400;
  }

  // Send error response
  res.status(err.statusCode).json({
    success: false,
    error: {
      message: err.message,
      code: err.code,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

module.exports = errorHandler;
module.exports.AppError = AppError;
