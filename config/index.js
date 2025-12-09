/**
 * M.M.H Delivery System Pro v4.0
 * Configuration Module
 * 
 * All configuration is loaded from environment variables
 * Never hardcode sensitive values!
 */

require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\n📋 Please copy .env.example to .env and fill in the values');
  process.exit(1);
}

// Security Configuration
const SECURITY = {
  BCRYPT_ROUNDS: 12,
  JWT_ACCESS_EXPIRY: process.env.JWT_ACCESS_EXPIRY || '15m',
  JWT_REFRESH_EXPIRY: process.env.JWT_REFRESH_EXPIRY || '7d',
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  LOCKOUT_TIME: parseInt(process.env.LOCKOUT_TIME) || 15 * 60 * 1000,
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 60 * 1000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  RATE_LIMIT_LOGIN: parseInt(process.env.RATE_LIMIT_LOGIN) || 5,
};

// Main Configuration
const CONFIG = {
  // Server
  PORT: parseInt(process.env.PORT) || 3001,
  PUBLIC_URL: process.env.PUBLIC_URL || 'http://localhost:3001',
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Security - JWT
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  
  // WhatsApp Integration
  WHAPI: {
    API_URL: 'https://gate.whapi.cloud',
    TOKEN: process.env.WHAPI_TOKEN || '',
    GROUP_ID: process.env.COURIERS_GROUP_ID || '',
    ENABLED: !!process.env.WHAPI_TOKEN,
  },
  
  // Google Maps
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  
  // Business Settings
  COMMISSION: parseFloat(process.env.COMMISSION_RATE) || 0.25,
  
  // Pricing
  PRICING: {
    BASE_PRICE: parseFloat(process.env.BASE_PRICE) || 75,
    PRICE_PER_KM: parseFloat(process.env.PRICE_PER_KM) || 2.5,
    FREE_KM: parseFloat(process.env.FREE_KM) || 1,
    MIN_PRICE: parseFloat(process.env.MIN_PRICE) || 75,
    VAT_RATE: parseFloat(process.env.VAT_RATE) || 0.18,
  },
  
  // Branding
  LOGO_URL: process.env.LOGO_URL || 'https://i.ibb.co/39WjvNZm/favicon.png',
  WHATSAPP_IMAGE_URL: process.env.WHATSAPP_IMAGE_URL || 'https://i.ibb.co/Rk3qyrvq/pages2.jpg',
  COMPANY_NAME: process.env.COMPANY_NAME || 'M.M.H משלוחים',
};

// Database Configuration
const DB_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 5000,
};

// Generate WebSocket URL from PUBLIC_URL
const getWebSocketUrl = () => {
  return CONFIG.PUBLIC_URL.replace('https://', 'wss://').replace('http://', 'ws://');
};

module.exports = {
  CONFIG,
  SECURITY,
  DB_CONFIG,
  getWebSocketUrl,
};
