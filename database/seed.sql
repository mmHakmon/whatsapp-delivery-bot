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
app.use('/api/admin', adminRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/courier', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courier', 'index.html'));
});

app.get('/track/:orderNumber', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize WebSocket
websocketService.initialize(server);

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  logger.success(`🚀 Server running on port ${PORT}`);
  logger.info(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🌐 Public URL: ${process.env.PUBLIC_URL || `http://localhost:${PORT}`}`);
  console.log('');
  console.log('✅ M.M.H Delivery System is ready!');
  console.log('');
  console.log('📍 Admin Panel: /admin');
  console.log('📍 Courier App: /courier');
  console.log('📍 Create Order: /');
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