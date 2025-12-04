import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import { he } from 'date-fns/locale'

// Tailwind class merge helper
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Format currency
export function formatCurrency(amount) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
  }).format(amount)
}

// Format date
export function formatDate(date, formatStr = 'dd/MM/yyyy') {
  if (!date) return '-'
  return format(new Date(date), formatStr, { locale: he })
}

// Format datetime
export function formatDateTime(date) {
  if (!date) return '-'
  return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: he })
}

// Format relative time
export function formatRelativeTime(date) {
  if (!date) return '-'
  return formatDistanceToNow(new Date(date), { locale: he, addSuffix: true })
}

// Delivery status labels and colors
export const deliveryStatusConfig = {
  pending: { label: 'ממתין', color: 'gray', icon: 'Clock' },
  published: { label: 'פורסם', color: 'blue', icon: 'Send' },
  assigned: { label: 'הוקצה', color: 'purple', icon: 'User' },
  picked_up: { label: 'נאסף', color: 'yellow', icon: 'Package' },
  in_transit: { label: 'בדרך', color: 'orange', icon: 'Truck' },
  delivered: { label: 'נמסר', color: 'green', icon: 'CheckCircle' },
  cancelled: { label: 'בוטל', color: 'red', icon: 'XCircle' },
  failed: { label: 'נכשל', color: 'red', icon: 'AlertCircle' },
}

// Payment status labels
export const paymentStatusConfig = {
  pending: { label: 'ממתין', color: 'gray' },
  approved: { label: 'אושר', color: 'blue' },
  paid: { label: 'שולם', color: 'green' },
  cancelled: { label: 'בוטל', color: 'red' },
}

// Priority labels
export const priorityConfig = {
  low: { label: 'נמוכה', color: 'gray' },
  normal: { label: 'רגילה', color: 'blue' },
  high: { label: 'גבוהה', color: 'orange' },
  urgent: { label: 'דחוף', color: 'red' },
}

// Vehicle types
export const vehicleTypes = {
  motorcycle: 'אופנוע',
  car: 'רכב',
  bicycle: 'אופניים',
  scooter: 'קטנוע',
  on_foot: 'רגלי',
}

// Package sizes
export const packageSizes = {
  small: 'קטן',
  medium: 'בינוני',
  large: 'גדול',
  xlarge: 'גדול מאוד',
}

// Generate delivery number
export function generateDeliveryNumber() {
  const date = new Date()
  const dateStr = format(date, 'yyyyMMdd')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `DL${dateStr}${random}`
}

// Phone number formatting
export function formatPhone(phone) {
  if (!phone) return '-'
  // Remove non-numeric characters
  const cleaned = phone.replace(/\D/g, '')
  // Format as Israeli phone number
  if (cleaned.startsWith('972')) {
    return `+${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5, 8)}-${cleaned.slice(8)}`
  }
  if (cleaned.startsWith('0')) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  return phone
}
