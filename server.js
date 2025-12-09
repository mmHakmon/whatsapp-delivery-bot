/**
 * M.M.H Delivery System Pro v4.0
 * Main Server File
 * 
 * Clean architecture with:
 * - Separate route files
 * - External configuration
 * - Proper error handling
 * - WebSocket support
 * - Graceful shutdown
 */

// ══════════════════════════════════════════════════════════════
// DEPENDENCIES
// ══════════════════════════════════════════════════════════════

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

// Configuration
const { CONFIG, getWebSocketUrl } = require('./config');
const { healthCheck } = require('./config/database');

// Middleware
const { 
  securityHeaders, 
  httpsRedirect, 
  rateLimit,
  verifyToken 
} = require('./middleware/security');

// Routes
const authRoutes = require('./routes/auth');
const ordersRoutes = require('./routes/orders');
const usersRoutes = require('./routes/users');
const couriersRoutes = require('./routes/couriers');
const paymentsRoutes = require('./routes/payments');
const reportsRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');

// Utils
const { formatPhoneToWaId } = require('./utils/whatsapp');

// ══════════════════════════════════════════════════════════════
// EXPRESS SETUP
// ══════════════════════════════════════════════════════════════

const app = express();
const server = http.createServer(app);

// Security middleware
app.use(securityHeaders);
app.use(httpsRedirect);

// CORS
app.use(cors({
  origin: CONFIG.NODE_ENV === 'production' ? CONFIG.PUBLIC_URL : '*',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use(rateLimit());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════════════════════════
// WEBSOCKET SETUP
// ══════════════════════════════════════════════════════════════

const wss = new WebSocket.Server({ server });
const clients = new Map();

// Broadcast to all connected clients
const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// Inject broadcast function to routes
ordersRoutes.setBroadcast(broadcast);
adminRoutes.setBroadcast(broadcast);

// WebSocket connection handler
wss.on('connection', async (ws) => {
  console.log('🔌 Client connected');
  
  try {
    // Send initial data
    const { query } = require('./config/database');
    const { formatOrder } = require('./routes/orders');
    
    const ordersResult = await query(`
      SELECT o.*, c.first_name as cfn, c.last_name as cln, c.phone as cph
      FROM orders o LEFT JOIN couriers c ON o.courier_id = c.id
      ORDER BY o.created_at DESC LIMIT 200
    `);
    const orders = ordersResult.rows.map(formatOrder);
    
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status='new' THEN 1 END) as new,
        COUNT(CASE WHEN status='published' THEN 1 END) as published,
        COUNT(CASE WHEN status IN ('taken','picked') THEN 1 END) as active,
        COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
        COALESCE(SUM(CASE WHEN status='delivered' THEN price END), 0) as revenue,
        COALESCE(SUM(CASE WHEN status='delivered' THEN commission END), 0) as commission
      FROM orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);
    
    ws.send(JSON.stringify({ 
      type: 'init', 
      data: { orders, stats: statsResult.rows[0] } 
    }));
    
  } catch (error) {
    console.error('WebSocket init error:', error);
  }
  
  // Message handler
  ws.on('message', async (msg) => {
    try {
      const { type, token, ...data } = JSON.parse(msg);
      
      // Authentication
      if (type === 'auth') {
        const user = verifyToken(data.token);
        if (user) {
          clients.set(ws, user);
          ws.send(JSON.stringify({ type: 'auth_success' }));
        }
        return;
      }
      
      const user = clients.get(ws);
      
      // Handle different message types
      if (type === 'create_order' && user) {
        // Delegate to orders route logic
        // This is a simplified version - actual implementation would import order creation
      } else if (type === 'publish' && user) {
        // Similar delegation
      } else if (type === 'cancel' && user) {
        // Similar delegation
      }
      
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  // Disconnect handler
  ws.on('close', () => {
    clients.delete(ws);
    console.log('🔌 Client disconnected');
  });
  
  // Ping/pong for keep-alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);
  
  ws.on('close', () => clearInterval(pingInterval));
});

// ══════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════

// Auth routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/orders', ordersRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/couriers', couriersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);

// Legacy route aliases
app.use('/api/activity-log', require('./routes/admin'));
app.post('/api/calculate-price', require('./middleware/security').requireAuth, async (req, res) => {
  const { calculateDeliveryPrice } = require('./utils/maps');
  const result = await calculateDeliveryPrice(req.body.pickupAddress, req.body.deliveryAddress);
  res.json(result);
});

// ══════════════════════════════════════════════════════════════
// PUBLIC ROUTES (No auth required)
// ══════════════════════════════════════════════════════════════

// Health check
app.get('/health', async (req, res) => {
  const dbHealth = await healthCheck();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    database: dbHealth,
    timestamp: new Date().toISOString()
  });
});

// Logo redirect
app.get('/logo.png', (req, res) => {
  res.redirect(CONFIG.LOGO_URL);
});

// Public order taking page
app.get('/take/:orderNumber', async (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'take-order.html'));
});

// Public status update pages
app.get('/status/:orderNumber/pickup', async (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'pickup.html'));
});

app.get('/status/:orderNumber/deliver', async (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'deliver.html'));
});

// Courier app page
app.get('/courier/:phone', async (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'courier-app.html'));
});

// Public API endpoints for order taking/status updates
app.post('/api/take/:orderNumber', async (req, res) => {
  const { takeOrder } = require('./routes/orders');
  res.json(await takeOrder(req.params.orderNumber, req.body));
});

app.post('/api/status/:orderNumber/pickup', async (req, res) => {
  const { pickupOrder } = require('./routes/orders');
  res.json(await pickupOrder(req.params.orderNumber));
});

app.post('/api/status/:orderNumber/deliver', async (req, res) => {
  const { deliverOrder } = require('./routes/orders');
  res.json(await deliverOrder(req.params.orderNumber));
});

// ══════════════════════════════════════════════════════════════
// WEBHOOK
// ══════════════════════════════════════════════════════════════

app.post('/webhook/whapi', async (req, res) => {
  try {
    const messages = req.body.messages;
    if (!messages?.length) return res.sendStatus(200);
    
    const { query } = require('./config/database');
    const { pickupOrder, deliverOrder } = require('./routes/orders');
    
    for (const m of messages) {
      if (m.from_me) continue;
      
      const courierResult = await query(
        "SELECT * FROM couriers WHERE whatsapp_id=$1",
        [m.chat_id]
      );
      if (!courierResult.rows[0]) continue;
      
      const text = m.text?.body?.toLowerCase() || '';
      
      if (text.includes('אספתי') || text.includes('נאסף')) {
        const orderResult = await query(
          "SELECT order_number FROM orders WHERE courier_id=$1 AND status='taken' ORDER BY taken_at DESC LIMIT 1",
          [courierResult.rows[0].id]
        );
        if (orderResult.rows[0]) {
          await pickupOrder(orderResult.rows[0].order_number);
        }
      }
      
      if (text.includes('מסרתי') || text.includes('נמסר')) {
        const orderResult = await query(
          "SELECT order_number FROM orders WHERE courier_id=$1 AND status='picked' ORDER BY picked_at DESC LIMIT 1",
          [courierResult.rows[0].id]
        );
        if (orderResult.rows[0]) {
          await deliverOrder(orderResult.rows[0].order_number);
        }
      }
    }
    
    res.sendStatus(200);
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

// ══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// ══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ══════════════════════════════════════════════════════════════

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ══════════════════════════════════════════════════════════════
// SCHEDULED TASKS
// ══════════════════════════════════════════════════════════════

// Check for stale orders every 30 minutes
setInterval(async () => {
  try {
    const { query } = require('./config/database');
    const staleOrders = await query(`
      SELECT * FROM orders 
      WHERE status = 'published' 
      AND published_at < NOW() - INTERVAL '1 hour'
    `);
    
    if (staleOrders.rows.length > 0) {
      console.log(`⚠️ ${staleOrders.rows.length} orders published for more than 1 hour`);
    }
  } catch (error) {
    console.error('Stale check error:', error);
  }
}, 30 * 60 * 1000);

// ══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ══════════════════════════════════════════════════════════════

const shutdown = async () => {
  console.log('\n🛑 Shutting down...');
  
  // Close WebSocket connections
  wss.clients.forEach(client => {
    client.close(1001, 'Server shutting down');
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed');
  });
  
  // Close database
  const { shutdown: dbShutdown } = require('./config/database');
  await dbShutdown();
  
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ══════════════════════════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════════════════════════

server.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     🚚  M.M.H Delivery System Pro v4.0  🚚                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Server: http://localhost:${CONFIG.PORT}                             ║`);
  console.log(`║  Public: ${CONFIG.PUBLIC_URL.padEnd(43)}║`);
  console.log(`║  Mode:   ${CONFIG.NODE_ENV.padEnd(43)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});

module.exports = { app, server, broadcast };
