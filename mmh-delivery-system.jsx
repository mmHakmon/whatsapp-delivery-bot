import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ==================== SERVER CONFIG ====================
const SERVER_URL = 'https://mmh-delivery.onrender.com';
const WS_URL = 'wss://mmh-delivery.onrender.com';

// ==================== NOTIFICATION SOUND ====================
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch (e) { console.log('Sound error:', e); }
};

// ==================== UTILITY FUNCTIONS ====================
const formatCurrency = (amount) => `₪${(amount || 0).toLocaleString()}`;

const formatDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

const getStatusColor = (status) => {
  const colors = {
    new: { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/50', solid: 'bg-slate-500' },
    published: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/50', solid: 'bg-amber-500' },
    taken: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/50', solid: 'bg-blue-500' },
    picked: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/50', solid: 'bg-purple-500' },
    delivered: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/50', solid: 'bg-emerald-500' },
    cancelled: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50', solid: 'bg-red-500' },
  };
  return colors[status] || colors.new;
};

const getStatusText = (status) => {
  const texts = { new: 'חדש', published: 'פורסם', taken: 'נתפס', picked: 'נאסף', delivered: 'נמסר', cancelled: 'בוטל' };
  return texts[status] || status;
};

const getPriorityColor = (priority) => {
  const colors = { normal: 'bg-slate-600', express: 'bg-orange-500', urgent: 'bg-red-500 animate-pulse' };
  return colors[priority] || colors.normal;
};

// ==================== ICON COMPONENTS ====================
const Icons = {
  Package: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>,
  Bike: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 100-2 1 1 0 000 2zM12 17.5V14l-3-3 4-3 2 3h3"/></svg>,
  User: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Users: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
  MapPin: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M20 6L9 17l-5-5"/></svg>,
  X: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  Send: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>,
  Wallet: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 100 4 2 2 0 000-4z"/></svg>,
  Bell: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  BellOff: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M13.73 21a2 2 0 01-3.46 0M18.63 13A17.89 17.89 0 0118 8M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14M18 8a6 6 0 00-9.33-5M1 1l22 22"/></svg>,
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M12 5v14M5 12h14"/></svg>,
  Truck: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  Wifi: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M5 12.55a11 11 0 0114 0M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>,
  WifiOff: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>,
  Search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  BarChart: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  CreditCard: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  Star: () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  Menu: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Home: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
};

// ==================== TOAST ====================
const Toast = ({ message, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const bg = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 ${bg} text-white px-6 py-3 rounded-2xl shadow-2xl z-50 flex items-center gap-3`} style={{animation: 'slideDown 0.3s ease-out'}}>
      {type === 'success' && <Icons.Check />}{type === 'error' && <Icons.X />}{type === 'info' && <Icons.Bell />}
      <span className="font-medium">{message}</span>
    </div>
  );
};

// ==================== STAT CARD ====================
const StatCard = ({ icon, label, value, subValue, color }) => (
  <div className="group bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-xl rounded-2xl p-5 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
    <div className="flex items-start justify-between">
      <div className={`p-3 rounded-xl ${color} transition-transform duration-300 group-hover:scale-110`}>{icon}</div>
    </div>
    <div className="mt-4">
      <div className="text-3xl font-black text-white tracking-tight">{value}</div>
      <div className="text-sm text-slate-400 mt-1 font-medium">{label}</div>
      {subValue && <div className="text-xs text-slate-500 mt-1">{subValue}</div>}
    </div>
  </div>
);

// ==================== STATUS TABS ====================
const StatusTabs = ({ activeFilter, onFilterChange, stats }) => {
  const tabs = [
    { id: 'all', label: 'הכל', count: stats.total },
    { id: 'new', label: 'חדש', count: stats.new },
    { id: 'published', label: 'פורסם', count: stats.published },
    { id: 'active', label: 'פעיל', count: stats.active },
    { id: 'delivered', label: 'נמסר', count: stats.delivered },
    { id: 'cancelled', label: 'בוטל', count: stats.cancelled },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onFilterChange(tab.id)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
            activeFilter === tab.id ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-700/50'
          }`}>
          {tab.label}
          <span className={`px-2 py-0.5 rounded-lg text-xs ${activeFilter === tab.id ? 'bg-emerald-500/30' : 'bg-slate-700/50'}`}>{tab.count}</span>
        </button>
      ))}
    </div>
  );
};

// ==================== ORDER CARD ====================
const OrderCard = ({ order, onPublish, onCancel }) => {
  const sc = getStatusColor(order.status);
  return (
    <div className="group bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden hover:border-slate-600/50 transition-all duration-300 hover:shadow-xl">
      <div className="p-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/30">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${getPriorityColor(order.priority)}`} />
          <span className="text-lg font-black text-white font-mono tracking-wider">{order.id}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${sc.bg} ${sc.text} border ${sc.border}`}>{getStatusText(order.status)}</span>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2"><Icons.Clock />{formatDate(order.createdAt)}</div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400"><Icons.User /></div>
          <div className="flex-1 min-w-0">
            <div className="text-white font-semibold truncate">{order.senderName}</div>
            <div className="text-sm text-slate-400">{order.senderPhone}</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400"><Icons.MapPin /></div>
          <div className="flex-1 min-w-0"><div className="text-xs text-slate-500 font-medium">איסוף</div><div className="text-sm text-slate-300 truncate">{order.pickupAddress}</div></div>
        </div>
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400"><Icons.MapPin /></div>
          <div className="flex-1 min-w-0"><div className="text-xs text-slate-500 font-medium">מסירה</div><div className="text-sm text-slate-300 truncate">{order.deliveryAddress}</div></div>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-slate-700/50">
          <div><div className="text-xs text-slate-500 font-medium">מחיר כולל</div><div className="text-xl font-black text-white">{formatCurrency(order.price)}</div></div>
          <div className="text-left"><div className="text-xs text-slate-500 font-medium">לשליח</div><div className="text-xl font-black text-emerald-400">{formatCurrency(order.courierPayout)}</div></div>
        </div>
        {order.courier && (
          <div className="bg-slate-700/30 rounded-xl p-3 border border-slate-600/30">
            <div className="text-xs text-slate-500 mb-1 font-medium">שליח</div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm">{order.courier.name?.charAt(0) || '?'}</div>
              <div><div className="text-white font-semibold">{order.courier.name}</div><div className="text-xs text-slate-400">{order.courier.phone}</div></div>
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          {order.status === 'new' && (<>
            <button onClick={() => onPublish(order.id)} className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"><Icons.Send />פרסם</button>
            <button onClick={() => onCancel(order.id)} className="px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-all"><Icons.X /></button>
          </>)}
          {['published', 'taken', 'picked'].includes(order.status) && (
            <button onClick={() => onCancel(order.id)} className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 py-2.5 rounded-xl font-bold transition-all">בטל משלוח</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== NEW ORDER FORM ====================
const NewOrderForm = ({ onSubmit, onClose }) => {
  const [form, setForm] = useState({ senderName: '', senderPhone: '', pickupAddress: '', receiverName: '', receiverPhone: '', deliveryAddress: '', details: '', price: '', priority: 'normal' });
  const handleSubmit = (e) => { e.preventDefault(); onSubmit({ ...form, price: parseInt(form.price) || 0 }); };
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-700/50 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-700/50 flex items-center justify-between sticky top-0 bg-slate-800/90 backdrop-blur-sm rounded-t-3xl">
          <h2 className="text-2xl font-black text-white">הזמנה חדשה</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-xl text-slate-400 transition-colors"><Icons.X /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-slate-400 mb-2 font-medium">שם שולח</label><input type="text" value={form.senderName} onChange={(e) => setForm(f => ({ ...f, senderName: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all" required /></div>
            <div><label className="block text-sm text-slate-400 mb-2 font-medium">טלפון שולח</label><input type="tel" value={form.senderPhone} onChange={(e) => setForm(f => ({ ...f, senderPhone: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all" required /></div>
          </div>
          <div><label className="block text-sm text-slate-400 mb-2 font-medium">כתובת איסוף</label><input type="text" value={form.pickupAddress} onChange={(e) => setForm(f => ({ ...f, pickupAddress: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all" required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-slate-400 mb-2 font-medium">שם מקבל</label><input type="text" value={form.receiverName} onChange={(e) => setForm(f => ({ ...f, receiverName: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all" required /></div>
            <div><label className="block text-sm text-slate-400 mb-2 font-medium">טלפון מקבל</label><input type="tel" value={form.receiverPhone} onChange={(e) => setForm(f => ({ ...f, receiverPhone: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all" required /></div>
          </div>
          <div><label className="block text-sm text-slate-400 mb-2 font-medium">כתובת מסירה</label><input type="text" value={form.deliveryAddress} onChange={(e) => setForm(f => ({ ...f, deliveryAddress: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all" required /></div>
          <div><label className="block text-sm text-slate-400 mb-2 font-medium">פרטים נוספים</label><textarea value={form.details} onChange={(e) => setForm(f => ({ ...f, details: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all h-24 resize-none" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-slate-400 mb-2 font-medium">מחיר (₪)</label><input type="number" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all" required /></div>
            <div><label className="block text-sm text-slate-400 mb-2 font-medium">עדיפות</label><select value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-emerald-500 focus:outline-none transition-all"><option value="normal">רגיל</option><option value="express">אקספרס</option><option value="urgent">דחוף</option></select></div>
          </div>
          <button type="submit" className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white py-4 rounded-xl font-black text-lg transition-all shadow-lg shadow-emerald-500/20">צור הזמנה</button>
        </form>
      </div>
    </div>
  );
};

// ==================== COURIERS PANEL ====================
const CouriersPanel = ({ orders, onClose }) => {
  const couriers = useMemo(() => {
    const map = new Map();
    orders.forEach(o => {
      if (o.courier) {
        const id = o.courier.whatsappId || o.courier.phone;
        if (!map.has(id)) map.set(id, { ...o.courier, deliveries: 0, totalEarnings: 0, activeOrders: [] });
        const c = map.get(id);
        if (o.status === 'delivered') { c.deliveries++; c.totalEarnings += o.courierPayout || 0; }
        else if (['taken', 'picked'].includes(o.status)) c.activeOrders.push(o);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.deliveries - a.deliveries);
  }, [orders]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-slate-700/50 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-700/50 flex items-center justify-between sticky top-0 bg-slate-800/90 backdrop-blur-sm">
          <div className="flex items-center gap-3"><div className="p-3 bg-purple-500/20 rounded-xl text-purple-400"><Icons.Users /></div><div><h2 className="text-2xl font-black text-white">ניהול שליחים</h2><p className="text-sm text-slate-400">{couriers.length} שליחים</p></div></div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-xl text-slate-400"><Icons.X /></button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {couriers.length === 0 ? (
            <div className="text-center py-12"><div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4"><Icons.Users /></div><h3 className="text-lg font-bold text-white mb-2">אין שליחים</h3><p className="text-slate-400">שליחים יופיעו כאן לאחר שיתפסו משלוחים</p></div>
          ) : (
            <div className="space-y-4">
              {couriers.map((c, idx) => (
                <div key={c.whatsappId || c.phone} className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white font-black text-xl">{c.name?.charAt(0) || '?'}</div>
                        {idx < 3 && <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-500 text-yellow-900' : idx === 1 ? 'bg-slate-300 text-slate-700' : 'bg-amber-600 text-amber-100'}`}>{idx + 1}</div>}
                      </div>
                      <div><div className="text-lg font-bold text-white">{c.name}</div><div className="text-sm text-slate-400">{c.phone}</div></div>
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-1 text-yellow-400 mb-1">{[...Array(Math.min(5, Math.ceil(c.deliveries / 5)))].map((_, i) => <Icons.Star key={i} />)}</div>
                      <div className="text-2xl font-black text-emerald-400">{formatCurrency(c.totalEarnings)}</div>
                      <div className="text-xs text-slate-500">{c.deliveries} משלוחים</div>
                    </div>
                  </div>
                  {c.activeOrders.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50">
                      <div className="text-xs text-amber-400 font-medium mb-2">משלוחים פעילים ({c.activeOrders.length})</div>
                      <div className="flex flex-wrap gap-2">{c.activeOrders.map(o => <span key={o.id} className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-lg text-xs font-medium">{o.id}</span>)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== ACCOUNTING PANEL ====================
const AccountingPanel = ({ orders, onClose }) => {
  const [period, setPeriod] = useState('all');
  const [selectedCourier, setSelectedCourier] = useState(null);
  const periods = { today: { label: 'היום', days: 0 }, week: { label: 'השבוע', days: 7 }, month: { label: 'החודש', days: 30 }, all: { label: 'הכל', days: 9999 } };

  const filtered = useMemo(() => {
    const now = new Date(), days = periods[period].days;
    return orders.filter(o => {
      if (o.status !== 'delivered') return false;
      if (days === 9999) return true;
      const d = new Date(o.deliveredAt || o.createdAt);
      return Math.floor((now - d) / 86400000) <= days;
    });
  }, [orders, period]);

  const courierStats = useMemo(() => {
    const s = new Map();
    filtered.forEach(o => {
      if (o.courier) {
        const id = o.courier.whatsappId || o.courier.phone;
        if (!s.has(id)) s.set(id, { ...o.courier, deliveries: 0, totalPayout: 0, orders: [] });
        const c = s.get(id); c.deliveries++; c.totalPayout += o.courierPayout || 0; c.orders.push(o);
      }
    });
    return Array.from(s.values()).sort((a, b) => b.totalPayout - a.totalPayout);
  }, [filtered]);

  const totals = useMemo(() => filtered.reduce((a, o) => ({ revenue: a.revenue + (o.price || 0), commission: a.commission + (o.commission || 0), payouts: a.payouts + (o.courierPayout || 0), count: a.count + 1 }), { revenue: 0, commission: 0, payouts: 0, count: 0 }), [filtered]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-slate-700/50 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-700/50 flex items-center justify-between sticky top-0 bg-slate-800/90 backdrop-blur-sm">
          <div className="flex items-center gap-3"><div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400"><Icons.CreditCard /></div><div><h2 className="text-2xl font-black text-white">התחשבנות</h2><p className="text-sm text-slate-400">חישוב תשלומים</p></div></div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-xl text-slate-400"><Icons.X /></button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          <div className="flex gap-2 mb-6">{Object.entries(periods).map(([k, v]) => <button key={k} onClick={() => setPeriod(k)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${period === k ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50' : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-700/50'}`}>{v.label}</button>)}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"><div className="text-xs text-slate-500 mb-1">סה״כ הכנסות</div><div className="text-2xl font-black text-white">{formatCurrency(totals.revenue)}</div></div>
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"><div className="text-xs text-slate-500 mb-1">עמלות</div><div className="text-2xl font-black text-emerald-400">{formatCurrency(totals.commission)}</div></div>
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"><div className="text-xs text-slate-500 mb-1">תשלומים לשליחים</div><div className="text-2xl font-black text-amber-400">{formatCurrency(totals.payouts)}</div></div>
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"><div className="text-xs text-slate-500 mb-1">משלוחים</div><div className="text-2xl font-black text-blue-400">{totals.count}</div></div>
          </div>
          <div className="space-y-3"><h3 className="text-lg font-bold text-white mb-4">פירוט לפי שליח</h3>
            {courierStats.length === 0 ? <div className="text-center py-8 text-slate-400">אין נתונים</div> : courierStats.map(c => (
              <div key={c.whatsappId || c.phone} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 cursor-pointer hover:border-slate-600/50" onClick={() => setSelectedCourier(selectedCourier === c ? null : c)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white font-bold">{c.name?.charAt(0) || '?'}</div><div><div className="font-bold text-white">{c.name}</div><div className="text-xs text-slate-400">{c.deliveries} משלוחים</div></div></div>
                  <div className="text-left"><div className="text-xl font-black text-emerald-400">{formatCurrency(c.totalPayout)}</div><div className="text-xs text-slate-500">לתשלום</div></div>
                </div>
                {selectedCourier === c && <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">{c.orders.map(o => <div key={o.id} className="flex items-center justify-between text-sm bg-slate-900/30 rounded-lg p-2"><span className="font-mono text-slate-300">{o.id}</span><span className="text-slate-400">{formatDate(o.deliveredAt || o.createdAt)}</span><span className="text-emerald-400 font-bold">{formatCurrency(o.courierPayout)}</span></div>)}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== STATISTICS PANEL ====================
const StatisticsPanel = ({ orders, onClose }) => {
  const stats = useMemo(() => {
    const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), weekAgo = new Date(today.getTime() - 7 * 86400000);
    const byStatus = orders.reduce((a, o) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {});
    const delivered = orders.filter(o => o.status === 'delivered');
    const todayO = delivered.filter(o => new Date(o.deliveredAt || o.createdAt) >= today);
    const weekO = delivered.filter(o => new Date(o.deliveredAt || o.createdAt) >= weekAgo);
    const avgTime = delivered.reduce((s, o) => o.createdAt && o.deliveredAt ? s + (new Date(o.deliveredAt) - new Date(o.createdAt)) / 60000 : s, 0) / (delivered.length || 1);
    const byPriority = orders.reduce((a, o) => { a[o.priority || 'normal'] = (a[o.priority || 'normal'] || 0) + 1; return a; }, {});
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000), nd = new Date(d.getTime() + 86400000);
      const dayO = delivered.filter(o => { const od = new Date(o.deliveredAt || o.createdAt); return od >= d && od < nd; });
      daily.push({ day: d.toLocaleDateString('he-IL', { weekday: 'short' }), count: dayO.length, revenue: dayO.reduce((s, o) => s + (o.price || 0), 0) });
    }
    return { byStatus, byPriority, dailyStats: daily, todayRevenue: todayO.reduce((s, o) => s + (o.price || 0), 0), weekRevenue: weekO.reduce((s, o) => s + (o.price || 0), 0), todayCount: todayO.length, weekCount: weekO.length, avgDeliveryTime: Math.round(avgTime), cancelRate: Math.round((byStatus.cancelled || 0) / (orders.length || 1) * 100) };
  }, [orders]);
  const maxDaily = Math.max(...stats.dailyStats.map(d => d.count), 1);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-slate-700/50 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-700/50 flex items-center justify-between sticky top-0 bg-slate-800/90 backdrop-blur-sm">
          <div className="flex items-center gap-3"><div className="p-3 bg-blue-500/20 rounded-xl text-blue-400"><Icons.BarChart /></div><div><h2 className="text-2xl font-black text-white">סטטיסטיקות</h2><p className="text-sm text-slate-400">נתונים וגרפים</p></div></div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-xl text-slate-400"><Icons.X /></button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"><div className="text-xs text-slate-500 mb-1">הכנסות היום</div><div className="text-2xl font-black text-emerald-400">{formatCurrency(stats.todayRevenue)}</div><div className="text-xs text-slate-400">{stats.todayCount} משלוחים</div></div>
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"><div className="text-xs text-slate-500 mb-1">הכנסות השבוע</div><div className="text-2xl font-black text-blue-400">{formatCurrency(stats.weekRevenue)}</div><div className="text-xs text-slate-400">{stats.weekCount} משלוחים</div></div>
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"><div className="text-xs text-slate-500 mb-1">זמן משלוח ממוצע</div><div className="text-2xl font-black text-amber-400">{stats.avgDeliveryTime} דק׳</div></div>
            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50"><div className="text-xs text-slate-500 mb-1">אחוז ביטולים</div><div className="text-2xl font-black text-red-400">{stats.cancelRate}%</div></div>
          </div>
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 mb-6">
            <h3 className="text-lg font-bold text-white mb-4">משלוחים ב-7 ימים אחרונים</h3>
            <div className="flex items-end justify-between h-40 gap-2">
              {stats.dailyStats.map((d, i) => <div key={i} className="flex-1 flex flex-col items-center"><div className="text-xs text-emerald-400 mb-1 font-bold">{d.count}</div><div className="w-full bg-gradient-to-t from-emerald-500 to-blue-500 rounded-t-lg transition-all duration-500" style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count > 0 ? '8px' : '2px' }} /><div className="text-xs text-slate-500 mt-2">{d.day}</div></div>)}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-lg font-bold text-white mb-4">לפי סטטוס</h3>
              <div className="space-y-3">{Object.entries(stats.byStatus).map(([s, c]) => { const col = getStatusColor(s), pct = Math.round((c / orders.length) * 100); return <div key={s} className="flex items-center gap-3"><div className={`w-3 h-3 rounded-full ${col.solid}`} /><div className="flex-1"><div className="flex justify-between text-sm mb-1"><span className="text-slate-300">{getStatusText(s)}</span><span className="text-slate-400">{c} ({pct}%)</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full ${col.solid} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} /></div></div></div>; })}</div>
            </div>
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <h3 className="text-lg font-bold text-white mb-4">לפי עדיפות</h3>
              <div className="space-y-3">{Object.entries(stats.byPriority).map(([p, c]) => { const pct = Math.round((c / orders.length) * 100), col = p === 'urgent' ? 'bg-red-500' : p === 'express' ? 'bg-orange-500' : 'bg-slate-500', lbl = p === 'urgent' ? 'דחוף' : p === 'express' ? 'אקספרס' : 'רגיל'; return <div key={p} className="flex items-center gap-3"><div className={`w-3 h-3 rounded-full ${col}`} /><div className="flex-1"><div className="flex justify-between text-sm mb-1"><span className="text-slate-300">{lbl}</span><span className="text-slate-400">{c} ({pct}%)</span></div><div className="h-2 bg-slate-700 rounded-full overflow-hidden"><div className={`h-full ${col} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} /></div></div></div>; })}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== SIDEBAR ====================
const Sidebar = ({ activeView, onViewChange, stats, isMobileOpen, onMobileClose }) => {
  const items = [
    { id: 'dashboard', icon: <Icons.Home />, label: 'דשבורד', badge: null },
    { id: 'couriers', icon: <Icons.Users />, label: 'שליחים', badge: null },
    { id: 'accounting', icon: <Icons.CreditCard />, label: 'התחשבנות', badge: null },
    { id: 'statistics', icon: <Icons.BarChart />, label: 'סטטיסטיקות', badge: null },
  ];
  return (
    <>
      {isMobileOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onMobileClose} />}
      <aside className={`fixed top-0 right-0 h-full w-64 bg-gradient-to-b from-slate-900 to-slate-800 border-l border-slate-700/50 z-50 transform transition-transform duration-300 md:translate-x-0 ${isMobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><Icons.Truck /></div>
            <div><h1 className="text-xl font-black bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">M.M.H</h1><p className="text-xs text-slate-500 font-medium">Delivery System</p></div>
          </div>
        </div>
        <nav className="p-4 space-y-2">{items.map(i => <button key={i.id} onClick={() => { onViewChange(i.id); onMobileClose(); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeView === i.id ? 'bg-gradient-to-r from-emerald-500/20 to-blue-500/20 text-white border border-emerald-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}><span className={activeView === i.id ? 'text-emerald-400' : ''}>{i.icon}</span><span className="font-medium">{i.label}</span>{i.badge > 0 && <span className="mr-auto px-2 py-0.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">{i.badge}</span>}</button>)}</nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700/50 bg-slate-900/50">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-xl p-3 text-center"><div className="text-lg font-black text-emerald-400">{stats.delivered}</div><div className="text-xs text-slate-500">נמסרו</div></div>
            <div className="bg-slate-800/50 rounded-xl p-3 text-center"><div className="text-lg font-black text-white">{formatCurrency(stats.revenue)}</div><div className="text-xs text-slate-500">הכנסות</div></div>
          </div>
        </div>
      </aside>
    </>
  );
};

// ==================== MAIN APPLICATION ====================
export default function DeliverySystem() {
  const [orders, setOrders] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showCouriers, setShowCouriers] = useState(false);
  const [showAccounting, setShowAccounting] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const showToast = useCallback((msg, type = 'info') => setToast({ message: msg, type }), []);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnecting(true);
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => { setConnected(true); setConnecting(false); showToast('מחובר לשרת', 'success'); };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        switch (m.type) {
          case 'orders_init': setOrders(m.data.orders || []); break;
          case 'new_order': setOrders(p => [m.data.order, ...p]); showToast(`הזמנה חדשה: ${m.data.order.id}`, 'info'); if (soundEnabled) playNotificationSound(); break;
          case 'order_published': setOrders(p => p.map(o => o.id === m.data.orderId ? { ...o, status: 'published' } : o)); break;
          case 'order_taken': setOrders(p => p.map(o => o.id === m.data.orderId ? { ...o, status: 'taken', courier: m.data.courier } : o)); showToast(`נתפס: ${m.data.orderId}`, 'success'); if (soundEnabled) playNotificationSound(); break;
          case 'order_picked': setOrders(p => p.map(o => o.id === m.data.orderId ? { ...o, status: 'picked' } : o)); break;
          case 'order_delivered': setOrders(p => p.map(o => o.id === m.data.orderId ? { ...o, status: 'delivered', deliveredAt: new Date().toISOString() } : o)); showToast(`נמסר: ${m.data.orderId}`, 'success'); if (soundEnabled) playNotificationSound(); break;
          case 'order_cancelled': setOrders(p => p.map(o => o.id === m.data.orderId ? { ...o, status: 'cancelled' } : o)); break;
        }
      } catch (err) { console.error(err); }
    };
    ws.onclose = () => { setConnected(false); setConnecting(false); reconnectTimeoutRef.current = setTimeout(() => connectWebSocket(), 3000); };
    ws.onerror = () => setConnecting(false);
    wsRef.current = ws;
  }, [showToast, soundEnabled]);

  useEffect(() => { connectWebSocket(); return () => { if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current); if (wsRef.current) wsRef.current.close(); }; }, [connectWebSocket]);

  const sendMessage = useCallback((type, data = {}) => { if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type, ...data })); else showToast('לא מחובר', 'error'); }, [showToast]);

  const handleNewOrder = (d) => { sendMessage('create_order', { data: d }); setShowNewOrder(false); showToast('יוצר הזמנה...', 'info'); };
  const handlePublish = (id) => { sendMessage('publish', { orderId: id }); showToast('מפרסם...', 'info'); };
  const handleCancel = (id) => { if (window.confirm('בטל משלוח?')) { sendMessage('cancel', { orderId: id }); showToast('מבטל...', 'info'); } };

  const stats = useMemo(() => ({
    total: orders.length, new: orders.filter(o => o.status === 'new').length, published: orders.filter(o => o.status === 'published').length,
    active: orders.filter(o => ['taken', 'picked'].includes(o.status)).length, delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length, revenue: orders.filter(o => o.status === 'delivered').reduce((s, o) => s + (o.price || 0), 0),
  }), [orders]);

  const filteredOrders = useMemo(() => {
    let r = orders;
    if (statusFilter !== 'all') r = statusFilter === 'active' ? r.filter(o => ['taken', 'picked'].includes(o.status)) : r.filter(o => o.status === statusFilter);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter(o => o.id?.toLowerCase().includes(q) || o.senderName?.toLowerCase().includes(q) || o.receiverName?.toLowerCase().includes(q) || o.pickupAddress?.toLowerCase().includes(q) || o.deliveryAddress?.toLowerCase().includes(q) || o.courier?.name?.toLowerCase().includes(q)); }
    return r;
  }, [orders, statusFilter, searchQuery]);

  useEffect(() => {
    if (activeView === 'couriers') setShowCouriers(true);
    else if (activeView === 'accounting') setShowAccounting(true);
    else if (activeView === 'statistics') setShowStatistics(true);
  }, [activeView]);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-3xl" />
      </div>
      <Sidebar activeView={activeView} onViewChange={setActiveView} stats={stats} isMobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      <div className="md:mr-64">
        <header className="sticky top-0 z-30 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl">
          <div className="px-4 md:px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 hover:bg-slate-800 rounded-xl text-slate-400"><Icons.Menu /></button>
              <div className="flex-1 max-w-md relative">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="חיפוש..." className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl pr-10 pl-4 py-2.5 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-all" style={{ paddingRight: '2.5rem' }} />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"><Icons.Search /></div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setSoundEnabled(!soundEnabled)} className={`p-2.5 rounded-xl transition-all ${soundEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800/50 text-slate-500'}`}>{soundEnabled ? <Icons.Bell /> : <Icons.BellOff />}</button>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${connected ? 'bg-emerald-500/20 text-emerald-400' : connecting ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>{connected ? <Icons.Wifi /> : <Icons.WifiOff />}<span className="hidden sm:inline">{connected ? 'מחובר' : connecting ? 'מתחבר...' : 'מנותק'}</span></div>
                <button onClick={() => setShowNewOrder(true)} className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"><Icons.Plus /><span className="hidden sm:inline">הזמנה חדשה</span></button>
              </div>
            </div>
          </div>
        </header>
        <main className="p-4 md:p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={<Icons.Package />} label="סה״כ הזמנות" value={stats.total} color="bg-blue-500/20 text-blue-400" />
            <StatCard icon={<Icons.Clock />} label="ממתינים" value={stats.new + stats.published} subValue={`${stats.new} חדשות, ${stats.published} פורסמו`} color="bg-amber-500/20 text-amber-400" />
            <StatCard icon={<Icons.Bike />} label="משלוחים פעילים" value={stats.active} color="bg-purple-500/20 text-purple-400" />
            <StatCard icon={<Icons.Wallet />} label="הכנסות" value={formatCurrency(stats.revenue)} subValue={`${stats.delivered} נמסרו`} color="bg-emerald-500/20 text-emerald-400" />
          </div>
          <div className="mb-6 overflow-x-auto pb-2"><StatusTabs activeFilter={statusFilter} onFilterChange={setStatusFilter} stats={stats} /></div>
          <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-black text-white flex items-center gap-2"><Icons.Package />הזמנות ({filteredOrders.length})</h2></div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{filteredOrders.map(o => <OrderCard key={o.id} order={o} onPublish={handlePublish} onCancel={handleCancel} />)}</div>
          {filteredOrders.length === 0 && <div className="text-center py-16"><div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6"><Icons.Package /></div><h3 className="text-xl font-bold text-white mb-2">{searchQuery ? 'לא נמצאו תוצאות' : 'אין הזמנות'}</h3><p className="text-slate-400">{searchQuery ? 'נסה לחפש משהו אחר' : 'לחץ "הזמנה חדשה" להתחיל'}</p></div>}
        </main>
      </div>
      {showNewOrder && <NewOrderForm onSubmit={handleNewOrder} onClose={() => setShowNewOrder(false)} />}
      {showCouriers && <CouriersPanel orders={orders} onClose={() => { setShowCouriers(false); setActiveView('dashboard'); }} />}
      {showAccounting && <AccountingPanel orders={orders} onClose={() => { setShowAccounting(false); setActiveView('dashboard'); }} />}
      {showStatistics && <StatisticsPanel orders={orders} onClose={() => { setShowStatistics(false); setActiveView('dashboard'); }} />}
      <style>{`@keyframes slideDown{from{opacity:0;transform:translate(-50%,-20px)}to{opacity:1;transform:translate(-50%,0)}}::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#475569}`}</style>
    </div>
  );
}
