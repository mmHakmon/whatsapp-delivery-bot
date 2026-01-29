import { format, formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount);
};

export const formatDate = (date, formatStr = 'dd/MM/yyyy HH:mm') => {
  if (!date) return '-';
  return format(new Date(date), formatStr, { locale: he });
};

export const formatRelativeTime = (date) => {
  if (!date) return '-';
  return formatDistanceToNow(new Date(date), { 
    addSuffix: true, 
    locale: he 
  });
};

export const formatPhone = (phone) => {
  if (!phone) return '-';
  // 972501234567 -> 050-123-4567
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('972')) {
    const local = cleaned.substring(3);
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return phone;
};

export const formatDistance = (km) => {
  if (!km) return '-';
  return `${km.toFixed(1)} ק"מ`;
};

export const formatDuration = (minutes) => {
  if (!minutes) return '-';
  if (minutes < 60) {
    return `${minutes} דקות`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} שעות ${mins} דקות`;
};

export const getStatusLabel = (status) => {
  const labels = {
    pending: 'ממתין',
    published: 'מפורסם',
    claimed: 'נתפס',
    picked_up: 'נאסף',
    in_transit: 'בדרך',
    delivered: 'נמסר',
    completed: 'הושלם',
    cancelled: 'בוטל',
  };
  return labels[status] || status;
};

export const getStatusColor = (status) => {
  const colors = {
    pending: 'bg-gray-100 text-gray-800',
    published: 'bg-blue-100 text-blue-800',
    claimed: 'bg-yellow-100 text-yellow-800',
    picked_up: 'bg-purple-100 text-purple-800',
    in_transit: 'bg-indigo-100 text-indigo-800',
    delivered: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

export const getVehicleTypeLabel = (type) => {
  const labels = {
    motorcycle: 'אופנוע',
    car: 'רכב',
    van: 'טנדר',
    truck: 'משאית',
  };
  return labels[type] || type;
};

export const getVehicleTypeIcon = (type) => {
  const icons = {
    motorcycle: '🏍️',
    car: '🚗',
    van: '🚐',
    truck: '🚚',
  };
  return icons[type] || '🚗';
};
