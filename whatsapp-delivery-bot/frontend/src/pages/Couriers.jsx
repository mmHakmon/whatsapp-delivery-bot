import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Eye, Edit, Phone, Star, Package } from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, vehicleTypes, cn } from '../utils/helpers'
import toast from 'react-hot-toast'

function AddCourierModal({ isOpen, onClose }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', vehicle_type: 'motorcycle', base_rate: 15
  })
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data) => api.post('/couriers', data),
    onSuccess: () => {
      toast.success('שליח נוסף בהצלחה')
      queryClient.invalidateQueries(['couriers'])
      onClose()
      setForm({ name: '', phone: '', email: '', vehicle_type: 'motorcycle', base_rate: 15 })
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || 'שגיאה'),
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-4">הוספת שליח חדש</h2>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם מלא *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">טלפון *</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
              dir="ltr"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">אימייל</label>
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סוג רכב</label>
            <select
              className="input"
              value={form.vehicle_type}
              onChange={(e) => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
            >
              {Object.entries(vehicleTypes).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">תעריף בסיסי (₪)</label>
            <input
              type="number"
              className="input"
              value={form.base_rate}
              onChange={(e) => setForm(f => ({ ...f, base_rate: parseFloat(e.target.value) }))}
              dir="ltr"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">ביטול</button>
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'שומר...' : 'הוסף שליח'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Couriers() {
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['couriers', search],
    queryFn: () => api.get('/couriers', { params: { search } }).then(res => res.data),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/couriers/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('סטטוס עודכן')
      // Refetch handled by queryClient
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">שליחים</h1>
        <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="h-5 w-5" />
          שליח חדש
        </button>
      </div>

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="חיפוש לפי שם או טלפון..."
            className="input pr-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Couriers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-gray-500">טוען...</div>
        ) : data?.couriers?.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">לא נמצאו שליחים</div>
        ) : (
          data?.couriers?.map((courier) => (
            <div key={courier.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold',
                    courier.status === 'active' ? 'bg-whatsapp-light' : 'bg-gray-400'
                  )}>
                    {courier.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold">{courier.name}</h3>
                    <p className="text-sm text-gray-500">{vehicleTypes[courier.vehicle_type]}</p>
                  </div>
                </div>
                <span className={cn(
                  'badge',
                  courier.status === 'active' ? 'badge-success' : 
                  courier.status === 'inactive' ? 'badge-gray' : 'badge-danger'
                )}>
                  {courier.status === 'active' ? 'פעיל' : courier.status === 'inactive' ? 'לא פעיל' : 'מושהה'}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4" />
                  <span dir="ltr">{courier.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Package className="h-4 w-4" />
                  <span>{courier.total_deliveries || 0} משלוחים</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span>{parseFloat(courier.rating || 5).toFixed(1)}</span>
                </div>
              </div>

              <div className="pt-4 border-t flex items-center justify-between">
                <Link
                  to={`/couriers/${courier.id}`}
                  className="text-whatsapp-dark hover:underline text-sm font-medium flex items-center gap-1"
                >
                  <Eye className="h-4 w-4" />
                  צפייה בפרופיל
                </Link>
                <select
                  className="text-sm border rounded px-2 py-1"
                  value={courier.status}
                  onChange={(e) => statusMutation.mutate({ id: courier.id, status: e.target.value })}
                >
                  <option value="active">פעיל</option>
                  <option value="inactive">לא פעיל</option>
                  <option value="suspended">מושהה</option>
                </select>
              </div>
            </div>
          ))
        )}
      </div>

      <AddCourierModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  )
}
