import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://mmh-delivery.onrender.com/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - הוספת Token לכל בקשה
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - טיפול בשגיאות
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

// Deliveries APIs
export const deliveriesAPI = {
  getAll: (params) => api.get('/deliveries', { params }),
  getById: (id) => api.get(`/deliveries/${id}`),
  create: (data) => api.post('/deliveries', data),
  claim: (id, courierId) => api.post(`/deliveries/${id}/claim`, { courierId }),
  pickup: (id, courierId) => api.post(`/deliveries/${id}/pickup`, { courierId }),
  deliver: (id, courierId) => api.post(`/deliveries/${id}/deliver`, { courierId }),
  cancel: (id, reason) => api.post(`/deliveries/${id}/cancel`, { reason }),
  navigation: (id) => api.get(`/deliveries/${id}/navigation`),
};

// Couriers APIs
export const couriersAPI = {
  getAll: (params) => api.get('/couriers', { params }),
  getById: (id) => api.get(`/couriers/${id}`),
  create: (data) => api.post('/couriers', data),
  update: (id, data) => api.put(`/couriers/${id}`, data),
  updateLocation: (id, location) => api.post(`/couriers/${id}/location`, location),
  updateAvailability: (id, isAvailable) => api.post(`/couriers/${id}/availability`, { isAvailable }),
  addToBlacklist: (id, data) => api.post(`/couriers/${id}/blacklist`, data),
  removeFromBlacklist: (id) => api.delete(`/couriers/${id}/blacklist`),
  getStats: (id, params) => api.get(`/couriers/${id}/stats`, { params }),
};

// Dashboard APIs
export const dashboardAPI = {
  getRealtime: () => api.get('/dashboard/realtime'),
  getActiveCouriers: () => api.get('/dashboard/active-couriers'),
  getActiveDeliveries: () => api.get('/dashboard/active-deliveries'),
  getWeeklyStats: () => api.get('/dashboard/weekly-stats'),
  getTopCouriers: (params) => api.get('/dashboard/top-couriers', { params }),
};

// Analytics APIs
export const analyticsAPI = {
  getPerformance: (params) => api.get('/analytics/performance', { params }),
  getCouriers: (params) => api.get('/analytics/couriers', { params }),
  getZones: (params) => api.get('/analytics/zones', { params }),
  getPeakTimes: (params) => api.get('/analytics/peak-times', { params }),
  compare: (params) => api.get('/analytics/compare', { params }),
};

// Zones APIs
export const zonesAPI = {
  getAll: () => api.get('/zones'),
  getById: (id) => api.get(`/zones/${id}`),
  create: (data) => api.post('/zones', data),
  update: (id, data) => api.put(`/zones/${id}`, data),
  delete: (id) => api.delete(`/zones/${id}`),
  checkAddress: (location) => api.post('/zones/check-address', location),
};

// Chat APIs
export const chatAPI = {
  getMessages: (deliveryId) => api.get(`/chat/${deliveryId}`),
  sendMessage: (deliveryId, message) => api.post(`/chat/${deliveryId}/send`, { message }),
  markAsRead: (deliveryId) => api.put(`/chat/${deliveryId}/read`),
  getUnreadCount: (deliveryId) => api.get(`/chat/${deliveryId}/unread-count`),
};

// Alerts APIs
export const alertsAPI = {
  getAll: () => api.get('/alerts'),
  markAsRead: (id) => api.put(`/alerts/${id}/read`),
  resolve: (id) => api.put(`/alerts/${id}/resolve`),
};

// Reports APIs
export const reportsAPI = {
  getDaily: (params) => api.get('/reports/daily', { params }),
  getWeekly: (params) => api.get('/reports/weekly', { params }),
  exportExcel: (params) => api.get('/reports/export/excel', { 
    params,
    responseType: 'blob',
  }),
};

// Calculator API
export const calculatorAPI = {
  calculatePrice: (data) => api.post('/calculator/price', data),
};

export default api;
