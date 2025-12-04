import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus,
  Search,
  Filter,
  Send,
  Eye,
  XCircle,
  MoreVertical,
  Truck,
} from 'lucide-react'
import api from '../utils/api'
import {
  formatCurrency,
  formatDateTime,
  deliveryStatusConfig,
  priorityConfig,
  cn,
} from '../utils/helpers'
import toast from 'react-hot-toast'

const statusOptions = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'pending', label: 'ממתין' },
  { value: 'published', label: 'פורסם' },
  { value: 'assigned', label: 'הוקצה' },
  { value: 'picked_up', label: 'נאסף' },
  { value: 'delivered', label: 'נמסר' },
  { value: 'cancelled', label: 'בוטל' },
]

export default function Deliveries() {
  const [filters, setFilters] = useState({ status: '', search: '' })
  const [selectedDeliveries, setSelectedDeliveries] = useState([])
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', filters],
    queryFn: () => api.get('/deliveries', { params: filters }).then(res => res.data),
  })

  const publishMutation = useMutation({
    mutationFn: (id) => api.post(`/deliveries/${id}/publish`),
    onSuccess: () => {
      toast.success('משלוח פורסם בקבוצה')
      queryClient.invalidateQueries(['deliveries'])
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || 'שגיאה בפרסום'),
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/deliveries/${id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('משלוח בוטל')
      queryClient.invalidateQueries(['deliveries'])
    },
  })

  const bulkPublishMutation = useMutation({
    mutationFn: (delivery_ids) => api.post('/deliveries/bulk-publish', { delivery_ids }),
    onSuccess: (res) => {
      toast.success(`${res.data.published} משלוחים פורסמו`)
      setSelectedDeliveries([])
      queryClient.invalidateQueries(['deliveries'])
    },
  })

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const pendingIds = data?.deliveries
        ?.filter(d => d.status === 'pending')
        .map(d => d.id) || []
      setSelectedDeliveries(pendingIds)
    } else {
      setSelectedDeliveries([])
    }
  }

  const handleSelect = (id) => {
    setSelectedDeliveries(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleCancel = (delivery) => {
    if (confirm(`האם לבטל את משלוח #${delivery.delivery_number}?`)) {
      cancelMutation.mutate({ id: delivery.id, reason: 'ביטול ידני' })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">משלוחים</h1>
        <Link to="/deliveries/new" className="btn-primary flex items-center gap-2">
          <Plus className="h-5 w-5" />
          משלוח חדש
        </Link>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="חיפוש לפי מספר משלוח, עיר..."
              className="input pr-10"
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
          <select
            className="input w-full sm:w-48"
            value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Bulk actions */}
        {selectedDeliveries.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
            <span className="text-sm">{selectedDeliveries.length} משלוחים נבחרו</span>
            <button
              onClick={() => bulkPublishMutation.mutate(selectedDeliveries)}
              className="btn-primary text-sm py-1"
              disabled={bulkPublishMutation.isPending}
            >
              <Send className="h-4 w-4 ml-1" />
              פרסם לקבוצה
            </button>
          </div>
        )}
      </div>

      {/* Deliveries Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-right">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedDeliveries.length > 0 && 
                      selectedDeliveries.length === data?.deliveries?.filter(d => d.status === 'pending').length}
                  />
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">מספר</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">מסלול</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">סטטוס</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">שליח</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">מחיר</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">תאריך</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    טוען...
                  </td>
                </tr>
              ) : data?.deliveries?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    לא נמצאו משלוחים
                  </td>
                </tr>
              ) : (
                data?.deliveries?.map((delivery) => {
                  const status = deliveryStatusConfig[delivery.status]
                  const priority = priorityConfig[delivery.priority]
                  
                  return (
                    <tr key={delivery.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {delivery.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selectedDeliveries.includes(delivery.id)}
                            onChange={() => handleSelect(delivery.id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">#{delivery.delivery_number}</span>
                          {delivery.priority !== 'normal' && (
                            <span className={`badge badge-${priority.color}`}>{priority.label}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-gray-400" />
                          <span>{delivery.pickup_city}</span>
                          <span className="text-gray-400">←</span>
                          <span>{delivery.dropoff_city}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge badge-${status.color}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {delivery.courier_name || '-'}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatCurrency(delivery.total_price)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDateTime(delivery.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/deliveries/${delivery.id}`)}
                            className="p-2 hover:bg-gray-100 rounded-lg"
                            title="צפייה"
                          >
                            <Eye className="h-4 w-4 text-gray-500" />
                          </button>
                          {delivery.status === 'pending' && (
                            <button
                              onClick={() => publishMutation.mutate(delivery.id)}
                              className="p-2 hover:bg-green-100 rounded-lg"
                              title="פרסם"
                              disabled={publishMutation.isPending}
                            >
                              <Send className="h-4 w-4 text-green-600" />
                            </button>
                          )}
                          {!['delivered', 'cancelled'].includes(delivery.status) && (
                            <button
                              onClick={() => handleCancel(delivery)}
                              className="p-2 hover:bg-red-100 rounded-lg"
                              title="בטל"
                            >
                              <XCircle className="h-4 w-4 text-red-500" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
