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
    if (req.path.endsWith('.html') || req.path === '/courier') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
    next();
});

// Google Maps API Key
app.get('/api/config/google-maps-key', (req, res) => {
  res.json({ 
    apiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || ''
  });
});

// Price Calculation Endpoint
app.post('/api/calculate-price', (req, res) => {
  const { pickupLat, pickupLng, deliveryLat, deliveryLng, vehicleType } = req.body;
  
  try {
    if (!pickupLat || !pickupLng || !deliveryLat || !deliveryLng || !vehicleType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Calculate distance using Haversine formula
    const R = 6371;
    const dLat = (deliveryLat - pickupLat) * Math.PI / 180;
    const dLon = (deliveryLng - pickupLng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pickupLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    // Price per km by vehicle type
    const pricePerKm = {
      motorcycle: 2.5,
      bike: 2.5,
      scooter: 2.5,
      car: 2.7,
      van: 3.0,
      truck: 4.0
    };
    
    const rate = pricePerKm[vehicleType] || 2.5;
    const basePrice = Math.ceil(distance * rate);
    const vat = Math.ceil(basePrice * 0.18);
    const totalPrice = basePrice + vat;
    
    console.log('Price calculated:', {
      distance: distance.toFixed(1) + ' km',
      vehicle: vehicleType,
      total: totalPrice
    });
    
    res.json({
      distanceKm: parseFloat(distance.toFixed(1)),
      basePrice,
      vat,
      totalPrice
    });
    
  } catch (error) {
    console.error('Price calculation error:', error);
    res.status(500).json({ error: 'Error calculating price' });
  }
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

// Frontend Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/calculator', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calculator.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/courier', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courier', 'index.html'));
});

app.get('/courier/register.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courier', 'register.html'));
});

app.get('/customer/order.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'order.html'));
});

app.get('/customer/track.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'track.html'));
});

app.get('/customer/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'dashboard.html'));
});

app.get('/track/:orderNumber', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer', 'track.html'));
});

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
  console.log('WebSocket server initialized');
  console.log('Server running on port', PORT);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('Public URL:', PUBLIC_URL);
  console.log('');
  console.log('M.M.H Delivery System is ready!');
  console.log('');
  console.log('Admin Panel:', PUBLIC_URL + '/admin');
  console.log('Courier App:', PUBLIC_URL + '/courier');
  console.log('Customer Order:', PUBLIC_URL + '/customer/order.html');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
