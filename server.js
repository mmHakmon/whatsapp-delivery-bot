require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const path = require('path');

// Import services
const websocketService = require('./services/websocket.service');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth.routes');
const ordersRoutes = require('./routes/orders.routes');
const couriersRoutes = require('./routes/couriers.routes');
const paymentsRoutes = require('./routes/payments.routes');
const adminRoutes = require('./routes/admin.routes');
const customersRoutes = require('./routes/customers.routes');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Security & Performance Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('public'));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { 
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/couriers', couriersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/admin', adminRoutes);

// ==========================================
// FRONTEND ROUTES
// ==========================================

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Price Calculator
app.get('/calculator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calculator.html'));
});

// Admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Courier
app.get('/courier', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courier', 'index.html'));
});

app.get('/courier/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courier', 'register.html'));
});

// Customer
app.get('/customer/order.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'order.html'));
});

app.get('/customer/track.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'track.html'));
});

app.get('/customer/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'dashboard.html'));
});

// Track order by number
app.get('/track/:orderNumber', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'track.html'));
});

// Quick take from WhatsApp link
app.get('/take/:orderId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'take.html'));
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize WebSocket
websocketService.initialize(server);

// Start server
const PORT = process.env.PORT || 10000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

server.listen(PORT, () => {
  console.log('✅ WebSocket server initialized');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Public URL: ${PUBLIC_URL}`);
  console.log('');
  console.log('✅ M.M.H Delivery System is ready!');
  console.log('');
  console.log('📍 Admin Panel:', `${PUBLIC_URL}/admin`);
  console.log('📍 Courier App:', `${PUBLIC_URL}/courier`);
  console.log('📍 Customer Order:', `${PUBLIC_URL}/customer/order.html`);
  console.log('📍 Courier Register:', `${PUBLIC_URL}/courier/register.html`);
  console.log('📍 Price Calculator:', `${PUBLIC_URL}/calculator`);
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

module.exports = app;
