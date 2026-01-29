import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://mmh-delivery.onrender.com';

class SocketService {
  socket = null;
  listeners = new Map();

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      console.log('🔗 Socket connected:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // הצטרפות לחדר משלוח
  joinDelivery(deliveryId) {
    if (this.socket?.connected) {
      this.socket.emit('join-delivery', deliveryId);
    }
  }

  // שליחת מיקום שליח
  sendCourierLocation(data) {
    if (this.socket?.connected) {
      this.socket.emit('courier-location', data);
    }
  }

  // האזנה לאירועים
  on(event, callback) {
    if (!this.socket) return;

    this.socket.on(event, callback);
    
    // שמירת המאזין למחיקה מאוחר יותר
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  // הסרת מאזין
  off(event, callback) {
    if (!this.socket) return;

    this.socket.off(event, callback);

    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // הסרת כל המאזינים לאירוע
  removeAllListeners(event) {
    if (!this.socket) return;

    this.socket.off(event);
    this.listeners.delete(event);
  }
}

export const socketService = new SocketService();
export default socketService;
