import React, { useState, useEffect, useCallback, useRef } from 'react';

// ==================== SERVER CONFIG ====================
const SERVER_URL = 'https://mmh-delivery.onrender.com';
const WS_URL = 'wss://mmh-delivery.onrender.com';

// ==================== UTILITY FUNCTIONS ====================
const formatCurrency = (amount) => `₪${amount?.toLocaleString() || 0}`;

const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStatusColor = (status) => {
  const colors = {
    new: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/50' },
    published: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50' },
    taken: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
    picked: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' },
    delivered: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/50' },
    cancelled: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
  };
  return colors[status] || colors.new;
};

const getStatusText = (status) => {
  const texts = {
    new: 'חדש',
    published: 'פורסם בקבוצה',
    taken: 'נתפס',
    picked: 'נאסף',
    delivered: 'נמסר',
    cancelled: 'בוטל',
  };
  return texts[status] || status;
};

const getPriorityColor = (priority) => {
  const colors = {
    normal: 'bg-slate-600',
    express: 'bg-orange-500',
    urgent: 'bg-red-500 animate-pulse',
  };
  return colors[priority] || colors.normal;
};

// ==================== ICON COMPONENTS ====================
const Icons = {
  Package: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
    </svg>
  ),
  Bike: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/>
      <path d="M15 6a1 1 0 100-2 1 1 0 000 2zM12 17.5V14l-3-3 4-3 2 3h3"/>
    </svg>
  ),
  User: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Phone: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
    </svg>
  ),
  MapPin: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  Clock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  ),
  Send: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
    </svg>
  ),
  Wallet: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 100 4 2 2 0 000-4z"/>
    </svg>
  ),
  Bell: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  TrendingUp: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M23 6l-9.5 9.5-5-5L1 18M17 6h6v6"/>
    </svg>
  ),
  WhatsApp: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  Truck: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
  Wifi: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M5 12.55a11 11 0 0114 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
    </svg>
  ),
  WifiOff: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
    </svg>
  ),
};

// ==================== TOAST COMPONENT ====================
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
  
  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 ${bgColor} text-white px-6 py-3 rounded-xl shadow-2xl z-50 animate-slideDown flex items-center gap-3`}>
      {type === 'success' && <Icons.Check />}
      {type === 'error' && <Icons.X />}
      {type === 'info' && <Icons.Bell />}
      <span className="font-medium">{message}</span>
    </div>
  );
};

// ==================== STAT CARD ====================
const StatCard = ({ icon, label, value, subValue, color }) => (
  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50">
    <div className="flex items-start justify-between">
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
    </div>
    <div className="mt-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
      {subValue && <div className="text-xs text-slate-500 mt-1">{subValue}</div>}
    </div>
  </div>
);

// ==================== ORDER CARD ====================
const OrderCard = ({ order, onPublish, onCancel }) => {
  const statusColors = getStatusColor(order.status);
  
  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden hover:border-slate-600 transition-all">
      {/* Header */}
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${getPriorityColor(order.priority)}`} />
          <span className="text-lg font-bold text-white font-mono">{order.id}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>
            {getStatusText(order.status)}
          </span>
        </div>
        <div className="text-sm text-slate-400 flex items-center gap-2">
          <Icons.Clock />
          {formatDate(order.createdAt)}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Sender */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
            <Icons.User />
          </div>
          <div className="flex-1">
            <div className="text-white font-medium">{order.senderName}</div>
            <div className="text-sm text-slate-400">{order.senderPhone}</div>
          </div>
        </div>
        
        {/* Addresses */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
            <Icons.MapPin />
          </div>
          <div className="flex-1">
            <div className="text-xs text-slate-500">איסוף</div>
            <div className="text-sm text-slate-300">{order.pickupAddress}</div>
          </div>
        </div>
        
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
            <Icons.MapPin />
          </div>
          <div className="flex-1">
            <div className="text-xs text-slate-500">מסירה</div>
            <div className="text-sm text-slate-300">{order.deliveryAddress}</div>
          </div>
        </div>
        
        {/* Price */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
          <div>
            <div className="text-xs text-slate-500">מחיר כולל</div>
            <div className="text-lg font-bold text-white">{formatCurrency(order.price)}</div>
          </div>
          <div className="text-left">
            <div className="text-xs text-slate-500">לשליח</div>
            <div className="text-lg font-bold text-emerald-400">{formatCurrency(order.courierPayout)}</div>
          </div>
        </div>
        
        {/* Courier Info */}
        {order.courier && (
          <div className="bg-slate-700/50 rounded-xl p-3">
            <div className="text-xs text-slate-500 mb-1">שליח</div>
            <div className="text-white font-medium">{order.courier.name}</div>
            <div className="text-sm text-slate-400">{order.courier.phone}</div>
          </div>
        )}
        
        {/* Actions */}
        {order.status === 'new' && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => onPublish(order.id)}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
            >
              <Icons.Send />
              פרסם בקבוצה
            </button>
            <button
              onClick={() => onCancel(order.id)}
              className="px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-all"
            >
              <Icons.X />
            </button>
          </div>
        )}
        
        {order.status === 'published' && (
          <button
            onClick={() => onCancel(order.id)}
            className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 py-2 rounded-xl font-medium transition-all"
          >
            בטל משלוח
          </button>
        )}
      </div>
    </div>
  );
};

// ==================== NEW ORDER FORM ====================
const NewOrderForm = ({ onSubmit, onClose }) => {
  const [form, setForm] = useState({
    senderName: '',
    senderPhone: '',
    pickupAddress: '',
    receiverName: '',
    receiverPhone: '',
    deliveryAddress: '',
    details: '',
    price: '',
    priority: 'normal',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      price: parseInt(form.price) || 0,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">הזמנה חדשה</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400">
            <Icons.X />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">שם שולח</label>
              <input
                type="text"
                value={form.senderName}
                onChange={(e) => setForm(f => ({ ...f, senderName: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">טלפון שולח</label>
              <input
                type="tel"
                value={form.senderPhone}
                onChange={(e) => setForm(f => ({ ...f, senderPhone: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-1">כתובת איסוף</label>
            <input
              type="text"
              value={form.pickupAddress}
              onChange={(e) => setForm(f => ({ ...f, pickupAddress: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">שם מקבל</label>
              <input
                type="text"
                value={form.receiverName}
                onChange={(e) => setForm(f => ({ ...f, receiverName: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">טלפון מקבל</label>
              <input
                type="tel"
                value={form.receiverPhone}
                onChange={(e) => setForm(f => ({ ...f, receiverPhone: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-1">כתובת מסירה</label>
            <input
              type="text"
              value={form.deliveryAddress}
              onChange={(e) => setForm(f => ({ ...f, deliveryAddress: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-1">פרטים נוספים</label>
            <textarea
              value={form.details}
              onChange={(e) => setForm(f => ({ ...f, details: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none h-20 resize-none"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">מחיר (₪)</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">עדיפות</label>
              <select
                value={form.priority}
                onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="normal">רגיל</option>
                <option value="express">אקספרס</option>
                <option value="urgent">דחוף</option>
              </select>
            </div>
          </div>
          
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white py-3 rounded-xl font-bold transition-all"
          >
            צור הזמנה
          </button>
        </form>
      </div>
    </div>
  );
};

// ==================== MAIN APPLICATION ====================
export default function DeliverySystem() {
  const [orders, setOrders] = useState([]);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setConnecting(true);
    console.log('🔌 Connecting to WebSocket...');
    
    const ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      console.log('✅ WebSocket connected');
      setConnected(true);
      setConnecting(false);
      showToast('מחובר לשרת בזמן אמת', 'success');
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📨 Message:', message.type);
        
        switch (message.type) {
          case 'orders_init':
            setOrders(message.data.orders || []);
            break;
          case 'new_order':
            setOrders(prev => [message.data.order, ...prev]);
            showToast(`הזמנה חדשה: ${message.data.order.id}`, 'info');
            break;
          case 'order_published':
            setOrders(prev => prev.map(o => 
              o.id === message.data.orderId ? { ...o, status: 'published' } : o
            ));
            break;
          case 'order_taken':
            setOrders(prev => prev.map(o => 
              o.id === message.data.orderId ? { ...o, status: 'taken', courier: message.data.courier } : o
            ));
            showToast(`המשלוח ${message.data.orderId} נתפס!`, 'success');
            break;
          case 'order_picked':
            setOrders(prev => prev.map(o => 
              o.id === message.data.orderId ? { ...o, status: 'picked' } : o
            ));
            break;
          case 'order_delivered':
            setOrders(prev => prev.map(o => 
              o.id === message.data.orderId ? { ...o, status: 'delivered' } : o
            ));
            showToast(`המשלוח ${message.data.orderId} נמסר!`, 'success');
            break;
          case 'order_cancelled':
            setOrders(prev => prev.map(o => 
              o.id === message.data.orderId ? { ...o, status: 'cancelled' } : o
            ));
            break;
          default:
            break;
        }
      } catch (error) {
        console.error('Message parse error:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('❌ WebSocket disconnected');
      setConnected(false);
      setConnecting(false);
      
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('🔄 Attempting reconnect...');
        connectWebSocket();
      }, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnecting(false);
    };
    
    wsRef.current = ws;
  }, [showToast]);

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  // Send message via WebSocket
  const sendMessage = useCallback((type, data = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...data }));
    } else {
      showToast('לא מחובר לשרת', 'error');
    }
  }, [showToast]);

  // Handlers
  const handleNewOrder = (orderData) => {
    sendMessage('create_order', { data: orderData });
    setShowNewOrder(false);
    showToast('יוצר הזמנה...', 'info');
  };

  const handlePublish = (orderId) => {
    sendMessage('publish', { orderId });
    showToast('מפרסם בקבוצת השליחים...', 'info');
  };

  const handleCancel = (orderId) => {
    if (window.confirm('האם לבטל את המשלוח?')) {
      sendMessage('cancel', { orderId });
      showToast('מבטל משלוח...', 'info');
    }
  };

  // Stats
  const stats = {
    totalOrders: orders.length,
    newOrders: orders.filter(o => o.status === 'new').length,
    publishedOrders: orders.filter(o => o.status === 'published').length,
    activeDeliveries: orders.filter(o => ['taken', 'picked'].includes(o.status)).length,
    deliveredOrders: orders.filter(o => o.status === 'delivered').length,
    totalRevenue: orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + (o.price || 0), 0),
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Toast */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="relative z-10 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-xl flex items-center justify-center">
                <Icons.Truck />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                  M.M.H Delivery
                </h1>
                <p className="text-xs text-slate-500">מערכת ניהול משלוחים</p>
              </div>
            </div>
            
            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              connected ? 'bg-emerald-500/20 text-emerald-400' : 
              connecting ? 'bg-amber-500/20 text-amber-400' : 
              'bg-red-500/20 text-red-400'
            }`}>
              {connected ? <Icons.Wifi /> : <Icons.WifiOff />}
              {connected ? 'מחובר' : connecting ? 'מתחבר...' : 'מנותק'}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<Icons.Package />}
            label="סה״כ הזמנות"
            value={stats.totalOrders}
            color="bg-blue-500/20 text-blue-400"
          />
          <StatCard
            icon={<Icons.Clock />}
            label="ממתינים לפרסום"
            value={stats.newOrders}
            color="bg-amber-500/20 text-amber-400"
          />
          <StatCard
            icon={<Icons.Bike />}
            label="משלוחים פעילים"
            value={stats.activeDeliveries}
            color="bg-purple-500/20 text-purple-400"
          />
          <StatCard
            icon={<Icons.Wallet />}
            label="הכנסות"
            value={formatCurrency(stats.totalRevenue)}
            subValue={`${stats.deliveredOrders} נמסרו`}
            color="bg-emerald-500/20 text-emerald-400"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Icons.Package />
            הזמנות ({orders.length})
          </h2>
          <button
            onClick={() => setShowNewOrder(true)}
            className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <Icons.Plus />
            הזמנה חדשה
          </button>
        </div>

        {/* Orders Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onPublish={handlePublish}
              onCancel={handleCancel}
            />
          ))}
        </div>

        {orders.length === 0 && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icons.Package />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">אין הזמנות</h3>
            <p className="text-slate-400">לחץ "הזמנה חדשה" להתחיל</p>
          </div>
        )}
      </main>

      {/* New Order Modal */}
      {showNewOrder && (
        <NewOrderForm
          onSubmit={handleNewOrder}
          onClose={() => setShowNewOrder(false)}
        />
      )}

      {/* Styles */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
      `}</style>
    </div>
  );
}
