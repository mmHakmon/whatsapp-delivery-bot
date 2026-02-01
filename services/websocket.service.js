const WebSocket = require('ws');
const { WEBSOCKET_EVENTS } = require('../config/constants');

class WebSocketService {
  constructor() {
    this.clients = new Map();
  }

  initialize(server) {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws, req) => {
      const clientId = Date.now() + Math.random();
      this.clients.set(clientId, ws);
      console.log(`📱 Client connected: ${clientId}`);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`👋 Client disconnected: ${clientId}`);
      });

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
    });

    // Keep alive
    setInterval(() => {
      this.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('✅ WebSocket server initialized');
  }

  handleMessage(ws, data) {
    if (data.type === 'auth') {
      ws.userId = data.userId;
      ws.userRole = data.role;
      ws.userType = data.userType; // 'admin', 'courier', 'customer'
      console.log(`🔐 Client authenticated: ${data.userId} (${data.userType})`);
    }
  }

  // Broadcast to all clients
  broadcast(data, filterFn = null) {
    const message = JSON.stringify(data);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        if (!filterFn || filterFn(ws)) {
          ws.send(message);
        }
      }
    });
  }

  // Send to specific user
  sendToUser(userId, data) {
    const message = JSON.stringify(data);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN && ws.userId === userId) {
        ws.send(message);
      }
    });
  }

  // Broadcast to admins
  broadcastToAdmins(data) {
    this.broadcast(data, ws => ws.userType === 'admin');
  }

  // Broadcast to couriers
  broadcastToCouriers(data) {
    this.broadcast(data, ws => ws.userType === 'courier');
  }

  // Notify new order
  notifyNewOrder(order) {
    this.broadcastToAdmins({
      type: WEBSOCKET_EVENTS.NEW_ORDER,
      order
    });
  }

  // Notify order updated
  notifyOrderUpdated(order) {
    this.broadcast({
      type: WEBSOCKET_EVENTS.ORDER_UPDATED,
      order
    });
  }

  // Notify order taken
  notifyOrderTaken(order) {
    this.broadcast({
      type: WEBSOCKET_EVENTS.ORDER_TAKEN,
      order
    });
  }

  // Notify order picked
  notifyOrderPicked(order) {
    this.broadcast({
      type: WEBSOCKET_EVENTS.ORDER_PICKED,
      order
    });
  }

  // Notify order delivered
  notifyOrderDelivered(order) {
    this.broadcast({
      type: WEBSOCKET_EVENTS.ORDER_DELIVERED,
      order
    });
  }

  // Update courier location
  updateCourierLocation(courierId, location) {
    this.broadcast({
      type: WEBSOCKET_EVENTS.COURIER_LOCATION,
      courierId,
      location
    });
  }
}

module.exports = new WebSocketService();