import React, { useState, useEffect, useCallback } from 'react';

// ==================== DATA & STATE MANAGEMENT ====================
const generateOrderId = () => `MMH-${Math.floor(100 + Math.random() * 900)}`;

const initialOrders = [
  {
    id: 'MMH-101',
    customerName: 'יוסי כהן',
    customerPhone: '052-1234567',
    customerAddress: 'רחוב הרצל 45, תל אביב',
    pickupAddress: 'מסעדת השף, דיזנגוף 120',
    orderDetails: 'ארוחת צהריים משפחתית',
    price: 200,
    commission: 25,
    status: 'pending',
    createdAt: new Date(Date.now() - 3600000),
    assignedCourier: null,
    pickedAt: null,
    deliveredAt: null,
    notes: '',
    priority: 'normal',
    estimatedTime: 45,
  },
  {
    id: 'MMH-102',
    customerName: 'רחל לוי',
    customerPhone: '054-9876543',
    customerAddress: 'שדרות רוטשילד 78, תל אביב',
    pickupAddress: 'פיצה הבית, אלנבי 50',
    orderDetails: '2 פיצות גדולות + שתייה',
    price: 150,
    commission: 25,
    status: 'assigned',
    createdAt: new Date(Date.now() - 7200000),
    assignedCourier: {
      id: 'C001',
      name: 'דני שמש',
      phone: '050-1112233',
      vehicle: 'אופנוע',
      rating: 4.8,
    },
    pickedAt: null,
    deliveredAt: null,
    notes: 'הלקוחה ביקשה להתקשר לפני הגעה',
    priority: 'high',
    estimatedTime: 30,
  },
  {
    id: 'MMH-103',
    customerName: 'משה אברהם',
    customerPhone: '053-5551234',
    customerAddress: 'רחוב ביאליק 12, רמת גן',
    pickupAddress: 'סופר פארם, בן יהודה 100',
    orderDetails: 'תרופות מרשם',
    price: 80,
    commission: 25,
    status: 'picked',
    createdAt: new Date(Date.now() - 1800000),
    assignedCourier: {
      id: 'C002',
      name: 'עומר דוד',
      phone: '052-9998877',
      vehicle: 'קטנוע',
      rating: 4.9,
    },
    pickedAt: new Date(Date.now() - 900000),
    deliveredAt: null,
    notes: 'משלוח דחוף - תרופות',
    priority: 'urgent',
    estimatedTime: 20,
  },
];

const couriers = [
  { id: 'C001', name: 'דני שמש', phone: '050-1112233', vehicle: 'אופנוע', rating: 4.8, totalDeliveries: 156, earnings: 12450, available: true },
  { id: 'C002', name: 'עומר דוד', phone: '052-9998877', vehicle: 'קטנוע', rating: 4.9, totalDeliveries: 203, earnings: 18920, available: false },
  { id: 'C003', name: 'שרה מזרחי', phone: '054-3334455', vehicle: 'רכב', rating: 4.7, totalDeliveries: 89, earnings: 8750, available: true },
  { id: 'C004', name: 'אלי ברק', phone: '050-6667788', vehicle: 'אופניים חשמליים', rating: 4.6, totalDeliveries: 67, earnings: 5230, available: true },
];

// ==================== UTILITY FUNCTIONS ====================
const calculateCourierPayment = (price, commission) => {
  return price - (price * commission / 100);
};

const formatCurrency = (amount) => `₪${amount.toLocaleString()}`;

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
    pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50' },
    assigned: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50' },
    picked: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50' },
    delivered: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/50' },
    cancelled: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
  };
  return colors[status] || colors.pending;
};

const getStatusText = (status) => {
  const texts = {
    pending: 'ממתין לשליח',
    assigned: 'שליח מוקצה',
    picked: 'נאסף',
    delivered: 'נמסר',
    cancelled: 'בוטל',
  };
  return texts[status] || status;
};

const getPriorityColor = (priority) => {
  const colors = {
    normal: 'bg-slate-600',
    high: 'bg-orange-500',
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
  Star: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-400">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
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
  Settings: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
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
  BarChart: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M12 20V10M18 20V4M6 20v-4"/>
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
  Eye: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Copy: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
  Refresh: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
    </svg>
  ),
};

// ==================== WHATSAPP BOT SIMULATION ====================
const WhatsAppMessage = ({ message, isBot, timestamp }) => (
  <div className={`flex ${isBot ? 'justify-start' : 'justify-end'} mb-3 animate-slideIn`}>
    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
      isBot 
        ? 'bg-slate-700 rounded-tl-sm' 
        : 'bg-emerald-600 rounded-tr-sm'
    }`}>
      <div className="text-sm text-white whitespace-pre-line leading-relaxed">{message}</div>
      <div className="text-[10px] text-slate-400 mt-1 text-left">{timestamp}</div>
    </div>
  </div>
);

// ==================== NOTIFICATION TOAST ====================
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

// ==================== STATS CARD ====================
const StatCard = ({ icon, label, value, subValue, color, trend }) => (
  <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-slate-600 transition-all duration-300 hover:transform hover:scale-[1.02]">
    <div className="flex items-start justify-between">
      <div className={`p-3 rounded-xl ${color}`}>
        {icon}
      </div>
      {trend && (
        <div className={`flex items-center gap-1 text-xs ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          <Icons.TrendingUp />
          <span>{trend > 0 ? '+' : ''}{trend}%</span>
        </div>
      )}
    </div>
    <div className="mt-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-slate-400 mt-1">{label}</div>
      {subValue && <div className="text-xs text-slate-500 mt-1">{subValue}</div>}
    </div>
  </div>
);

// ==================== ORDER CARD ====================
const OrderCard = ({ order, onAction, viewMode }) => {
  const statusColors = getStatusColor(order.status);
  const courierPayment = calculateCourierPayment(order.price, order.commission);
  
  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden hover:border-slate-600 transition-all duration-300 group">
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
      <div className="p-4 space-y-4">
        {/* Customer Info */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
            <Icons.User />
          </div>
          <div className="flex-1">
            <div className="text-white font-medium">{order.customerName}</div>
            <div className="text-sm text-slate-400 flex items-center gap-2 mt-1">
              <Icons.Phone />
              {order.customerPhone}
            </div>
          </div>
        </div>
        
        {/* Addresses */}
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
              <Icons.MapPin />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 mb-1">איסוף מ:</div>
              <div className="text-sm text-slate-300">{order.pickupAddress}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
              <Icons.MapPin />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500 mb-1">משלוח ל:</div>
              <div className="text-sm text-slate-300">{order.customerAddress}</div>
            </div>
          </div>
        </div>
        
        {/* Order Details */}
        <div className="bg-slate-900/50 rounded-xl p-3">
          <div className="text-xs text-slate-500 mb-1">פרטי ההזמנה:</div>
          <div className="text-sm text-white">{order.orderDetails}</div>
          {order.notes && (
            <div className="mt-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1 inline-block">
              📝 {order.notes}
            </div>
          )}
        </div>
        
        {/* Pricing */}
        <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 rounded-xl p-4 border border-emerald-500/20">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-slate-500">עלות משלוח</div>
              <div className="text-xl font-bold text-white">{formatCurrency(order.price)}</div>
            </div>
            <div className="text-center px-4 border-x border-slate-700">
              <div className="text-xs text-slate-500">עמלה</div>
              <div className="text-lg font-bold text-amber-400">{order.commission}%</div>
            </div>
            <div className="text-left">
              <div className="text-xs text-slate-500">לשליח</div>
              <div className="text-xl font-bold text-emerald-400">{formatCurrency(courierPayment)}</div>
            </div>
          </div>
        </div>
        
        {/* Assigned Courier */}
        {order.assignedCourier && (
          <div className="bg-purple-500/10 rounded-xl p-3 border border-purple-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-500/30 rounded-full flex items-center justify-center text-purple-300">
                  <Icons.Bike />
                </div>
                <div>
                  <div className="text-white font-medium">{order.assignedCourier.name}</div>
                  <div className="text-sm text-slate-400">{order.assignedCourier.phone}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Icons.Star />
                <span className="text-white font-medium">{order.assignedCourier.rating}</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Timeline */}
        {(order.pickedAt || order.deliveredAt) && (
          <div className="flex items-center gap-4 text-xs text-slate-400">
            {order.pickedAt && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-purple-400" />
                <span>נאסף: {formatDate(order.pickedAt)}</span>
              </div>
            )}
            {order.deliveredAt && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>נמסר: {formatDate(order.deliveredAt)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="p-4 bg-slate-900/30 border-t border-slate-700/50 flex gap-2">
        {viewMode === 'admin' && order.status === 'pending' && (
          <button
            onClick={() => onAction('assign', order)}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-2.5 font-medium transition-all flex items-center justify-center gap-2"
          >
            <Icons.Bike />
            הקצה שליח
          </button>
        )}
        {viewMode === 'courier' && order.status === 'assigned' && (
          <button
            onClick={() => onAction('pick', order)}
            className="flex-1 bg-purple-500 hover:bg-purple-600 text-white rounded-xl py-2.5 font-medium transition-all flex items-center justify-center gap-2"
          >
            <Icons.Package />
            אישור איסוף
          </button>
        )}
        {viewMode === 'courier' && order.status === 'picked' && (
          <button
            onClick={() => onAction('deliver', order)}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-2.5 font-medium transition-all flex items-center justify-center gap-2"
          >
            <Icons.Check />
            אישור מסירה
          </button>
        )}
        <button
          onClick={() => onAction('view', order)}
          className="px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2.5 transition-all"
        >
          <Icons.Eye />
        </button>
      </div>
    </div>
  );
};

// ==================== COURIER CARD ====================
const CourierCard = ({ courier, onSelect, selected }) => (
  <div 
    onClick={() => courier.available && onSelect(courier)}
    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
      selected 
        ? 'border-emerald-500 bg-emerald-500/10' 
        : courier.available 
          ? 'border-slate-700 hover:border-slate-600 bg-slate-800/50' 
          : 'border-slate-800 bg-slate-900/50 opacity-50 cursor-not-allowed'
    }`}
  >
    <div className="flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
        courier.available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500'
      }`}>
        <Icons.Bike />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">{courier.name}</span>
          {!courier.available && (
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">לא זמין</span>
          )}
        </div>
        <div className="text-sm text-slate-400">{courier.vehicle}</div>
      </div>
      <div className="text-left">
        <div className="flex items-center gap-1">
          <Icons.Star />
          <span className="text-white font-medium">{courier.rating}</span>
        </div>
        <div className="text-xs text-slate-500">{courier.totalDeliveries} משלוחים</div>
      </div>
    </div>
  </div>
);

// ==================== NEW ORDER FORM ====================
const NewOrderForm = ({ onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    pickupAddress: '',
    orderDetails: '',
    price: '',
    commission: 25,
    priority: 'normal',
    notes: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      id: generateOrderId(),
      price: Number(formData.price),
      status: 'pending',
      createdAt: new Date(),
      assignedCourier: null,
      pickedAt: null,
      deliveredAt: null,
      estimatedTime: 45,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700">
        <div className="p-6 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800 z-10">
          <h2 className="text-xl font-bold text-white">הזמנה חדשה</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-xl transition-colors">
            <Icons.X />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">שם הלקוח</label>
              <input
                type="text"
                required
                value={formData.customerName}
                onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="ישראל ישראלי"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">טלפון</label>
              <input
                type="tel"
                required
                value={formData.customerPhone}
                onChange={(e) => setFormData({...formData, customerPhone: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="050-1234567"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">כתובת איסוף</label>
            <input
              type="text"
              required
              value={formData.pickupAddress}
              onChange={(e) => setFormData({...formData, pickupAddress: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="שם העסק, רחוב ומספר, עיר"
            />
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">כתובת מסירה</label>
            <input
              type="text"
              required
              value={formData.customerAddress}
              onChange={(e) => setFormData({...formData, customerAddress: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="רחוב ומספר, עיר"
            />
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">פרטי ההזמנה</label>
            <textarea
              required
              value={formData.orderDetails}
              onChange={(e) => setFormData({...formData, orderDetails: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors resize-none h-24"
              placeholder="תיאור המשלוח..."
            />
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">עלות משלוח (₪)</label>
              <input
                type="number"
                required
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
                placeholder="200"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">עמלה (%)</label>
              <input
                type="number"
                required
                min="0"
                max="100"
                value={formData.commission}
                onChange={(e) => setFormData({...formData, commission: Number(e.target.value)})}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">עדיפות</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({...formData, priority: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
              >
                <option value="normal">רגילה</option>
                <option value="high">גבוהה</option>
                <option value="urgent">דחוף</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm text-slate-400 mb-2">הערות (אופציונלי)</label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:outline-none transition-colors"
              placeholder="הערות מיוחדות..."
            />
          </div>
          
          {/* Preview */}
          {formData.price && (
            <div className="bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-xl p-4 border border-emerald-500/30">
              <div className="text-sm text-slate-400 mb-2">תצוגה מקדימה:</div>
              <div className="flex items-center justify-between">
                <div className="text-white">
                  {formatCurrency(Number(formData.price))} - {formData.commission}% = <span className="text-emerald-400 font-bold">{formatCurrency(calculateCourierPayment(Number(formData.price), formData.commission))}</span> לשליח
                </div>
              </div>
            </div>
          )}
          
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-3 font-medium transition-all"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white rounded-xl py-3 font-medium transition-all flex items-center justify-center gap-2"
            >
              <Icons.Send />
              שלח להזמנה
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==================== ASSIGN COURIER MODAL ====================
const AssignCourierModal = ({ order, onAssign, onClose }) => {
  const [selectedCourier, setSelectedCourier] = useState(null);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-3xl w-full max-w-xl border border-slate-700">
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">הקצאת שליח</h2>
            <p className="text-sm text-slate-400 mt-1">הזמנה {order.id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-xl transition-colors">
            <Icons.X />
          </button>
        </div>
        
        <div className="p-6 space-y-3 max-h-96 overflow-y-auto">
          {couriers.map((courier) => (
            <CourierCard
              key={courier.id}
              courier={courier}
              selected={selectedCourier?.id === courier.id}
              onSelect={setSelectedCourier}
            />
          ))}
        </div>
        
        <div className="p-6 border-t border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-3 font-medium transition-all"
          >
            ביטול
          </button>
          <button
            onClick={() => selectedCourier && onAssign(order, selectedCourier)}
            disabled={!selectedCourier}
            className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-xl py-3 font-medium transition-all flex items-center justify-center gap-2"
          >
            <Icons.Check />
            אשר הקצאה
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== ORDER DETAILS MODAL ====================
const OrderDetailsModal = ({ order, onClose }) => {
  const courierPayment = calculateCourierPayment(order.price, order.commission);
  const statusColors = getStatusColor(order.status);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-700">
        <div className="p-6 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-800 z-10">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold text-white font-mono">{order.id}</span>
            <span className={`px-4 py-1.5 rounded-full text-sm font-medium ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>
              {getStatusText(order.status)}
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-xl transition-colors">
            <Icons.X />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Customer Section */}
          <div className="bg-slate-900/50 rounded-2xl p-5">
            <h3 className="text-sm text-slate-500 uppercase tracking-wide mb-4">פרטי לקוח</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Icons.User />
                <span className="text-white">{order.customerName}</span>
              </div>
              <div className="flex items-center gap-3">
                <Icons.Phone />
                <a href={`tel:${order.customerPhone}`} className="text-blue-400 hover:underline">{order.customerPhone}</a>
              </div>
              <div className="flex items-center gap-3">
                <Icons.MapPin />
                <span className="text-slate-300">{order.customerAddress}</span>
              </div>
            </div>
          </div>
          
          {/* Pickup Section */}
          <div className="bg-amber-500/10 rounded-2xl p-5 border border-amber-500/30">
            <h3 className="text-sm text-amber-400 uppercase tracking-wide mb-4">נקודת איסוף</h3>
            <div className="flex items-center gap-3">
              <Icons.MapPin />
              <span className="text-white">{order.pickupAddress}</span>
            </div>
          </div>
          
          {/* Order Details */}
          <div className="bg-slate-900/50 rounded-2xl p-5">
            <h3 className="text-sm text-slate-500 uppercase tracking-wide mb-4">פרטי ההזמנה</h3>
            <p className="text-white">{order.orderDetails}</p>
            {order.notes && (
              <div className="mt-3 bg-amber-500/10 rounded-xl px-4 py-2 text-amber-300 text-sm">
                📝 {order.notes}
              </div>
            )}
          </div>
          
          {/* Financial Summary */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-blue-500/10 to-purple-500/10 rounded-2xl p-5 border border-emerald-500/30">
            <h3 className="text-sm text-emerald-400 uppercase tracking-wide mb-4">סיכום כספי</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-lg">
                <span className="text-slate-400">עלות משלוח:</span>
                <span className="text-white font-bold">{formatCurrency(order.price)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">עמלת חברה ({order.commission}%):</span>
                <span className="text-red-400">-{formatCurrency(order.price * order.commission / 100)}</span>
              </div>
              <div className="border-t border-slate-700 pt-3 flex justify-between items-center">
                <span className="text-slate-400">תשלום לשליח:</span>
                <span className="text-2xl font-bold text-emerald-400">{formatCurrency(courierPayment)}</span>
              </div>
            </div>
          </div>
          
          {/* Courier Section */}
          {order.assignedCourier && (
            <div className="bg-purple-500/10 rounded-2xl p-5 border border-purple-500/30">
              <h3 className="text-sm text-purple-400 uppercase tracking-wide mb-4">שליח מוקצה</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-purple-500/30 rounded-full flex items-center justify-center text-purple-300">
                    <Icons.Bike />
                  </div>
                  <div>
                    <div className="text-lg text-white font-medium">{order.assignedCourier.name}</div>
                    <div className="text-slate-400">{order.assignedCourier.phone}</div>
                    <div className="text-sm text-slate-500">{order.assignedCourier.vehicle}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-yellow-500/20 px-3 py-2 rounded-xl">
                  <Icons.Star />
                  <span className="text-xl font-bold text-white">{order.assignedCourier.rating}</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Timeline */}
          <div className="bg-slate-900/50 rounded-2xl p-5">
            <h3 className="text-sm text-slate-500 uppercase tracking-wide mb-4">ציר זמן</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <div className="flex-1">
                  <div className="text-white">הזמנה נוצרה</div>
                  <div className="text-sm text-slate-500">{formatDate(order.createdAt)}</div>
                </div>
              </div>
              {order.assignedCourier && (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <div className="flex-1">
                    <div className="text-white">שליח הוקצה</div>
                    <div className="text-sm text-slate-500">{order.assignedCourier.name}</div>
                  </div>
                </div>
              )}
              {order.pickedAt && (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="flex-1">
                    <div className="text-white">המשלוח נאסף</div>
                    <div className="text-sm text-slate-500">{formatDate(order.pickedAt)}</div>
                  </div>
                </div>
              )}
              {order.deliveredAt && (
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <div className="flex-1">
                    <div className="text-white">המשלוח נמסר</div>
                    <div className="text-sm text-slate-500">{formatDate(order.deliveredAt)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== WHATSAPP SIMULATION PANEL ====================
const WhatsAppPanel = ({ messages, onSendMessage }) => {
  const [input, setInput] = useState('');
  const messagesEndRef = React.useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center gap-3 bg-emerald-600 rounded-t-2xl">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          <Icons.WhatsApp />
        </div>
        <div>
          <div className="text-white font-medium">בוט שליחויות MMH</div>
          <div className="text-xs text-emerald-100">קבוצת שליחים</div>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22100%22%20height%3D%22100%22%20viewBox%3D%220%200%20100%20100%22%3E%3Crect%20fill%3D%22%231e293b%22%20width%3D%22100%22%20height%3D%22100%22%2F%3E%3Cpath%20fill%3D%22%23334155%22%20fill-opacity%3D%220.1%22%20d%3D%22M0%200h50v50H0zM50%2050h50v50H50z%22%2F%3E%3C%2Fsvg%3E')]">
        {messages.map((msg, index) => (
          <WhatsAppMessage key={index} {...msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="p-4 border-t border-slate-700 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="הקלד הודעה..."
          className="flex-1 bg-slate-900 border border-slate-700 rounded-full px-4 py-2.5 text-white focus:border-emerald-500 focus:outline-none text-sm"
        />
        <button
          onClick={handleSend}
          className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <Icons.Send />
        </button>
      </div>
    </div>
  );
};

// ==================== MAIN APPLICATION ====================
export default function DeliverySystem() {
  const [viewMode, setViewMode] = useState('admin'); // admin, courier, customer
  const [orders, setOrders] = useState(initialOrders);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [toast, setToast] = useState(null);
  const [whatsappMessages, setWhatsappMessages] = useState([
    {
      message: `🚀 ברוכים הבאים לבוט השליחויות של MMH!\n\nכאן תקבלו עדכונים על משלוחים חדשים.\n\nלחצו על הקישור לקבלת המשלוח.`,
      isBot: true,
      timestamp: '10:00',
    },
  ]);
  const [selectedCourier] = useState(couriers[0]); // Simulated logged-in courier
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Stats calculations
  const stats = {
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 'pending').length,
    activeDeliveries: orders.filter(o => ['assigned', 'picked'].includes(o.status)).length,
    completedToday: orders.filter(o => o.status === 'delivered' && new Date(o.deliveredAt).toDateString() === new Date().toDateString()).length,
    totalRevenue: orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + o.price, 0),
    totalCommission: orders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + (o.price * o.commission / 100), 0),
  };

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const addWhatsAppMessage = useCallback((message, isBot = true) => {
    const now = new Date();
    setWhatsappMessages(prev => [...prev, {
      message,
      isBot,
      timestamp: now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    }]);
  }, []);

  const handleNewOrder = (orderData) => {
    setOrders(prev => [orderData, ...prev]);
    setShowNewOrder(false);
    showToast('ההזמנה נוצרה בהצלחה!', 'success');
    
    // WhatsApp notification
    addWhatsAppMessage(
      `🆕 *משלוח חדש!*\n\n` +
      `📦 מספר: ${orderData.id}\n` +
      `📍 איסוף: ${orderData.pickupAddress}\n` +
      `🏠 יעד: ${orderData.customerAddress}\n` +
      `💰 תשלום: ${formatCurrency(calculateCourierPayment(orderData.price, orderData.commission))}\n\n` +
      `👉 לחץ כאן לקבלת המשלוח`
    );
  };

  const handleAssignCourier = (order, courier) => {
    setOrders(prev => prev.map(o => 
      o.id === order.id 
        ? { ...o, status: 'assigned', assignedCourier: courier }
        : o
    ));
    setAssigningOrder(null);
    showToast(`השליח ${courier.name} הוקצה למשלוח ${order.id}`, 'success');
    
    // WhatsApp notification to courier
    addWhatsAppMessage(
      `✅ *${courier.name}* לקח את המשלוח!\n\n` +
      `📦 מספר: ${order.id}\n` +
      `📍 איסוף מ: ${order.pickupAddress}\n` +
      `🏠 מסירה ל: ${order.customerName}\n` +
      `📞 טלפון: ${order.customerPhone}\n` +
      `📮 כתובת: ${order.customerAddress}\n\n` +
      `פרטי ההזמנה: ${order.orderDetails}\n\n` +
      `💰 *תשלום: ${formatCurrency(calculateCourierPayment(order.price, order.commission))}*`
    );
  };

  const handlePickOrder = (order) => {
    setOrders(prev => prev.map(o => 
      o.id === order.id 
        ? { ...o, status: 'picked', pickedAt: new Date() }
        : o
    ));
    showToast(`המשלוח ${order.id} נאסף!`, 'success');
    
    // WhatsApp notification
    addWhatsAppMessage(
      `📦 *המשלוח נאסף!*\n\n` +
      `מספר: ${order.id}\n` +
      `שליח: ${order.assignedCourier.name}\n\n` +
      `בדרך ללקוח...`
    );
  };

  const handleDeliverOrder = (order) => {
    const courierPayment = calculateCourierPayment(order.price, order.commission);
    setOrders(prev => prev.map(o => 
      o.id === order.id 
        ? { ...o, status: 'delivered', deliveredAt: new Date() }
        : o
    ));
    showToast(`המשלוח ${order.id} נמסר בהצלחה!`, 'success');
    
    // WhatsApp notification with calculation
    addWhatsAppMessage(
      `✅ *המשלוח נמסר בהצלחה!*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 משלוח מספר: ${order.id}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 *חישוב תשלום:*\n` +
      `עלות משלוח: ${formatCurrency(order.price)}\n` +
      `עמלת חברה: ${order.commission}%\n\n` +
      `*${order.price} - ${order.commission}% = ${formatCurrency(courierPayment)}*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💵 *מגיע לך: ${formatCurrency(courierPayment)}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🎉 כל הכבוד ${order.assignedCourier.name}!`
    );
  };

  const handleOrderAction = (action, order) => {
    switch (action) {
      case 'assign':
        setAssigningOrder(order);
        break;
      case 'pick':
        handlePickOrder(order);
        break;
      case 'deliver':
        handleDeliverOrder(order);
        break;
      case 'view':
        setViewingOrder(order);
        break;
      default:
        break;
    }
  };

  const handleWhatsAppMessage = (message) => {
    addWhatsAppMessage(message, false);
    
    // Bot auto-response simulation
    setTimeout(() => {
      if (message.includes('קח') || message.includes('לקחת')) {
        addWhatsAppMessage('✅ נרשם! אנא המתן לאישור הנציג.');
      } else if (message.includes('סטטוס') || message.includes('איפה')) {
        addWhatsAppMessage('📍 המשלוח בדרך אליך! זמן הגעה משוער: 15 דקות.');
      } else {
        addWhatsAppMessage('🤖 תודה על ההודעה! נציג יחזור אליך בהקדם.');
      }
    }, 1000);
  };

  const filteredOrders = viewMode === 'courier' 
    ? orders.filter(o => o.assignedCourier?.id === selectedCourier.id || o.status === 'pending')
    : orders;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      {/* Toast Notification */}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="relative z-10 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Icons.Truck />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                  MMH Delivery
                </h1>
                <p className="text-xs text-slate-500">מערכת שליחויות מקצועית</p>
              </div>
            </div>

            {/* View Mode Tabs */}
            <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
              {[
                { id: 'admin', label: 'נציג', icon: <Icons.Settings /> },
                { id: 'courier', label: 'שליח', icon: <Icons.Bike /> },
                { id: 'customer', label: 'לקוח', icon: <Icons.User /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    viewMode === tab.id
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Time & Actions */}
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-400">
                {currentTime.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors relative">
                <Icons.Bell />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
                  {stats.pendingOrders}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats Section */}
        {viewMode === 'admin' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<Icons.Package />}
              label="סה״כ הזמנות"
              value={stats.totalOrders}
              color="bg-blue-500/20 text-blue-400"
              trend={12}
            />
            <StatCard
              icon={<Icons.Clock />}
              label="ממתינים לשליח"
              value={stats.pendingOrders}
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
              label="הכנסות היום"
              value={formatCurrency(stats.totalRevenue)}
              subValue={`עמלות: ${formatCurrency(stats.totalCommission)}`}
              color="bg-emerald-500/20 text-emerald-400"
              trend={8}
            />
          </div>
        )}

        {/* Courier Stats */}
        {viewMode === 'courier' && (
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl p-5 border border-purple-500/30 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-purple-500/30 rounded-full flex items-center justify-center text-purple-300">
                  <Icons.User />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{selectedCourier.name}</div>
                  <div className="text-slate-400">{selectedCourier.vehicle}</div>
                </div>
              </div>
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{selectedCourier.totalDeliveries}</div>
                  <div className="text-sm text-slate-400">משלוחים</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400">{formatCurrency(selectedCourier.earnings)}</div>
                  <div className="text-sm text-slate-400">רווחים</div>
                </div>
                <div className="text-center flex items-center gap-2">
                  <Icons.Star />
                  <div className="text-2xl font-bold text-white">{selectedCourier.rating}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Orders Section */}
          <div className="lg:col-span-2 space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Icons.Package />
                {viewMode === 'admin' ? 'כל ההזמנות' : viewMode === 'courier' ? 'המשלוחים שלי' : 'ההזמנות שלי'}
              </h2>
              {viewMode === 'admin' && (
                <button
                  onClick={() => setShowNewOrder(true)}
                  className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white px-4 py-2 rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Icons.Plus />
                  הזמנה חדשה
                </button>
              )}
            </div>

            {/* Orders Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {filteredOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onAction={handleOrderAction}
                  viewMode={viewMode}
                />
              ))}
            </div>

            {filteredOrders.length === 0 && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icons.Package />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">אין הזמנות</h3>
                <p className="text-slate-400">לא נמצאו הזמנות להצגה</p>
              </div>
            )}
          </div>

          {/* WhatsApp Panel */}
          <div className="lg:col-span-1 h-[600px]">
            <WhatsAppPanel
              messages={whatsappMessages}
              onSendMessage={handleWhatsAppMessage}
            />
          </div>
        </div>
      </main>

      {/* Modals */}
      {showNewOrder && (
        <NewOrderForm
          onSubmit={handleNewOrder}
          onClose={() => setShowNewOrder(false)}
        />
      )}

      {assigningOrder && (
        <AssignCourierModal
          order={assigningOrder}
          onAssign={handleAssignCourier}
          onClose={() => setAssigningOrder(null)}
        />
      )}

      {viewingOrder && (
        <OrderDetailsModal
          order={viewingOrder}
          onClose={() => setViewingOrder(null)}
        />
      )}

      {/* Custom Styles */}
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
        
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>
    </div>
  );
}
