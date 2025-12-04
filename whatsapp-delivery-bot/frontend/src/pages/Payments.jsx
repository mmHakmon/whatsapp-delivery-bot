import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, DollarSign, FileText, Eye } from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatDate, paymentStatusConfig, cn } from '../utils/helpers'
import toast from 'react-hot-toast'

function CreatePaymentModal({ isOpen, onClose }) {
  const [form, setForm] = useState({
    courier_id: '',
    period_start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    period_end: new Date().toISOString().split('T')[0],
  })
  const queryClient = useQueryClient()

  const { data: couriers } = useQuery({
    queryKey: ['couriers-list'],
    queryFn: () => api.get('/couriers?status=active').then(res => res.data.couriers),
    enabled: isOpen,
  })

  const previewQuery = useQuery({
    queryKey: ['payment-preview', form.courier_id, form.period_start, form.period_end],
    queryFn: () => api.get(`/payments/calculate/${form.courier_id}`, {
      params: { period_start: form.period_start, period_end: form.period_end }
    }).then(res => res.data.earnings),
    enabled: Boolean(form.courier_id && form.period_start && form.period_end),
  })

  const mutation = useMutation({
    mutationFn: (data) => api.post('/payments', data),
    onSuccess: () => {
      toast.success('רשומת תשלום נוצרה')
      queryClient.invalidateQueries(['payments'])
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || 'שגיאה'),
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-bold mb-4">יצירת רשומת תשלום</h2>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שליח *</label>
            <select
              className="input"
              value={form.courier_id}
              onChange={(e) => setForm(f => ({ ...f, courier_id: e.target.value }))}
              required
            >
              <option value="">בחר שליח</option>
              {couriers?.map((c) => (
                <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">מתאריך</label>
              <input
                type="date"
                className="input"
                value={form.period_start}
                onChange={(e) => setForm(f => ({ ...f, period_start: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">עד תאריך</label>
              <input
                type="date"
                className="input"
                value={form.period_end}
                onChange={(e) => setForm(f => ({ ...f, period_end: e.target.value }))}
              />
            </div>
          </div>

          {previewQuery.data && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium mb-2">תצוגה מקדימה:</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span>משלוחים:</span>
                <span className="font-medium">{previewQuery.data.totalDeliveries}</span>
                <span>סה"כ בסיס:</span>
                <span className="font-medium">{formatCurrency(previewQuery.data.baseEarnings)}</span>
                <span>בונוסים:</span>
                <span className="font-medium">{formatCurrency(previewQuery.data.bonusEarnings)}</span>
                <span className="font-bold">סה"כ לתשלום:</span>
                <span className="font-bold text-whatsapp-dark">{formatCurrency(previewQuery.data.totalAmount)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">ביטול</button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={mutation.isPending || !previewQuery.data?.totalDeliveries}
            >
              {mutation.isPending ? 'יוצר...' : 'צור רשומה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PaymentDetailModal({ payment, onClose }) {
  const queryClient = useQueryClient()

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/payments/${payment.id}/approve`),
    onSuccess: () => {
      toast.success('תשלום אושר')
      queryClient.invalidateQueries(['payments'])
      onClose()
    },
  })

  const payMutation = useMutation({
    mutationFn: (reference) => api.post(`/payments/${payment.id}/mark-paid`, { payment_reference: reference }),
    onSuccess: () => {
      toast.success('תשלום סומן כשולם')
      queryClient.invalidateQueries(['payments'])
      onClose()
    },
  })

  const handleMarkPaid = () => {
    const reference = prompt('הזן אסמכתא לתשלום:')
    if (reference) {
      payMutation.mutate(reference)
    }
  }

  if (!payment) return null

  const status = paymentStatusConfig[payment.status]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">פרטי תשלום</h2>
          <span className={`badge badge-${status.color}`}>{status.label}</span>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">שליח</p>
            <p className="font-bold text-lg">{payment.courier_name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">תקופה</p>
              <p className="font-medium">{formatDate(payment.period_start)} - {formatDate(payment.period_end)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">משלוחים</p>
              <p className="font-medium">{payment.total_deliveries}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between mb-2">
              <span>בסיס:</span>
              <span>{formatCurrency(payment.base_earnings)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>בונוסים:</span>
              <span>{formatCurrency(payment.bonus_earnings)}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span>טיפים:</span>
              <span>{formatCurrency(payment.tips)}</span>
            </div>
            <div className="flex justify-between mb-2 text-red-600">
              <span>ניכויים:</span>
              <span>-{formatCurrency(payment.deductions)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>סה"כ:</span>
              <span className="text-whatsapp-dark">{formatCurrency(payment.total_amount)}</span>
            </div>
          </div>

          {payment.payment_reference && (
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600">אסמכתא: {payment.payment_reference}</p>
              <p className="text-sm text-gray-600">שולם: {formatDate(payment.paid_at)}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button onClick={onClose} className="btn-secondary flex-1">סגור</button>
            {payment.status === 'pending' && (
              <button
                onClick={() => approveMutation.mutate()}
                className="btn-primary flex-1"
                disabled={approveMutation.isPending}
              >
                <Check className="h-4 w-4 ml-1" />
                אשר תשלום
              </button>
            )}
            {payment.status === 'approved' && (
              <button
                onClick={handleMarkPaid}
                className="btn-primary flex-1 bg-green-600 hover:bg-green-700"
                disabled={payMutation.isPending}
              >
                <DollarSign className="h-4 w-4 ml-1" />
                סמן כשולם
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Payments() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['payments', statusFilter],
    queryFn: () => api.get('/payments', { params: { status: statusFilter } }).then(res => res.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['payment-stats'],
    queryFn: () => api.get('/payments/stats').then(res => res.data.stats),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">תשלומים</h1>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="h-5 w-5" />
          תשלום חדש
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-sm text-gray-500">סה"כ תשלומים</p>
          <p className="text-2xl font-bold">{formatCurrency(stats?.total_amount || 0)}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">ממתינים</p>
          <p className="text-2xl font-bold text-yellow-600">{formatCurrency(stats?.pending_amount || 0)}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">שולמו</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(stats?.paid_amount || 0)}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">רשומות</p>
          <p className="text-2xl font-bold">{stats?.total_payments || 0}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="card">
        <select
          className="input w-full sm:w-48"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="approved">אושר</option>
          <option value="paid">שולם</option>
        </select>
      </div>

      {/* Payments List */}
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">שליח</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">תקופה</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">משלוחים</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">סכום</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">סטטוס</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">טוען...</td></tr>
            ) : data?.payments?.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">לא נמצאו תשלומים</td></tr>
            ) : (
              data?.payments?.map((payment) => {
                const status = paymentStatusConfig[payment.status]
                return (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{payment.courier_name}</td>
                    <td className="px-4 py-3 text-sm">
                      {formatDate(payment.period_start)} - {formatDate(payment.period_end)}
                    </td>
                    <td className="px-4 py-3">{payment.total_deliveries}</td>
                    <td className="px-4 py-3 font-bold">{formatCurrency(payment.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge badge-${status.color}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedPayment(payment)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <Eye className="h-4 w-4 text-gray-500" />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <CreatePaymentModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
      <PaymentDetailModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} />
    </div>
  )
}
