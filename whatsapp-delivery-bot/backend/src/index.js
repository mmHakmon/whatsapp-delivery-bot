require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

const logger = require('./utils/logger');
const { pool, testConnection } = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const deliveryRoutes = require('./routes/deliveries');
const courierRoutes = require('./routes/couriers');
const paymentRoutes = require('./routes/payments');
const whatsappRoutes = require('./routes/whatsapp');
const dashboardRoutes = require('./routes/dashboard');
const settingsRoutes = require('./routes/settings');

// Services
const SchedulerService = require('./services/SchedulerService');

const app = express();
const httpServer = createServer(app);

// Socket.IO for real-time updates
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);

// WhatsApp Webhook verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      logger.info('Webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Error handling
app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('join-admin', () => {
    socket.join('admins');
    logger.info(`Admin joined: ${socket.id}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Scheduled tasks
// Daily summary at 22:00
cron.schedule('0 22 * * *', async () => {
  logger.info('Running daily summary job');
  await SchedulerService.sendDailySummaryToAllCouriers();
  await SchedulerService.generateDailyStats();
});

// Auto-cancel unclaimed deliveries every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await SchedulerService.autoCancelExpiredDeliveries();
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test database connection
    await testConnection();
    
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📱 WhatsApp webhook ready at /webhook`);
      logger.info(`🔌 Socket.IO ready for real-time updates`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, io };
