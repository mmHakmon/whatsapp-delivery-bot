require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');

// Routes
const authRoutes = require('./routes/auth.routes');
const deliveryRoutes = require('./routes/delivery.routes');
const courierRoutes = require('./routes/courier.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const calculatorRoutes = require('./routes/calculator.routes');
const zoneRoutes = require('./routes/zone.routes');
const chatRoutes = require('./routes/chat.routes');
const webhookRoutes = require('./routes/webhook.routes');

// Services
const alertService = require('./services/alert.service');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io accessible to routes
app.set('io', io);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'M.M.H Delivery System V2'
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/calculator', calculatorRoutes);

// Socket.io connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-delivery', (deliveryId) => {
    socket.join(`delivery-${deliveryId}`);
    console.log(`Socket ${socket.id} joined delivery ${deliveryId}`);
  });

  socket.on('courier-location', async (data) => {
    const { courierId, lat, lng } = data;
    // Update courier location in DB
    const courierService = require('./services/courier.service');
    await courierService.updateLocation(courierId, lat, lng);
    
    // Broadcast to dashboard
    io.emit('courier-moved', { courierId, lat, lng });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Cron jobs
// בדיקת משלוחים שלא נתפסו כל 5 דקות
cron.schedule('*/5 * * * *', async () => {
  console.log('Running: Check unclaimed deliveries');
  await alertService.checkUnclaimedDeliveries();
});

// בדיקת שליחים תקועים כל 10 דקות
cron.schedule('*/10 * * * *', async () => {
  console.log('Running: Check stuck couriers');
  await alertService.checkStuckCouriers();
});

// דוח יומי אוטומטי ב-23:00
cron.schedule('0 23 * * *', async () => {
  console.log('Running: Daily report generation');
  const reportService = require('./services/report.service');
  await reportService.generateDailyReport();
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'משהו השתבש!', 
    message: err.message 
  });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   M.M.H Delivery System V2 Started   ║
  ║   Port: ${PORT}                         ║
  ║   Environment: ${process.env.NODE_ENV}           ║
  ╚═══════════════════════════════════════╝
  `);
});

module.exports = { app, io };
