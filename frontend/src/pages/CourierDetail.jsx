import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Phone, Mail, Car, Star, Package, DollarSign, Calendar } from 'lucide-react'
import api from '../utils/api'
import { formatCurrency, formatDateTime, vehicleTypes, deliveryStatusConfig } from '../utils/helpers'

export default function CourierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['courier', id],
    queryFn: () => api.get(`/couriers/${id}`).then(res => res.data.courier),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-whatsapp-light border-t-transparent rounded-full" />
      </div>
    )
  }

  const courier = data

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/couriers')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowRight className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">פרופיל שליח</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="card">
          <div className="text-center">
            <div className="h-20 w-20 rounded-full bg-whatsapp-light/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl font-bold text-whatsapp-dark">{courier.name.charAt(0)}</span>
            </div>
            <h2 className="text-xl font-bold">{courier.name}</h2>
            <p className="text-gray-500">{vehicleTypes[courier.vehicle_type]}</p>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 text-gray-600">
              <Phone className="h-5 w-5" />
              <span dir="ltr">{courier.phone}</span>
            </div>
            {courier.email && (
              <div className="flex items-center gap-3 text-gray-600">
                <Mail className="h-5 w-5" />
                <span>{courier.email}</span>
              </div>
            )}
            {courier.vehicle_number && (
              <div className="flex items-center gap-3 text-gray-600">
                <Car className="h-5 w-5" />
                <span>{courier.vehicle_number}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-gray-600">
              <Calendar className="h-5 w-5" />
              <span>הצטרף: {formatDateTime(courier.joined_at)}</span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t">
            <h3 className="font-medium mb-3">תעריפים</h3>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">בסיס</p>
                <p className="font-bold text-lg">{formatCurrency(courier.base_rate)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">בונוס</p>
                <p className="font-bold text-lg">{formatCurrency(courier.bonus_rate)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats & History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Monthly Stats */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">סטטיסטיקות החודש</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Package className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-bold">{courier.monthly_stats?.total_deliveries || 0}</p>
                <p className="text-sm text-gray-500">משלוחים</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <DollarSign className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-bold">{formatCurrency(courier.monthly_stats?.total_earnings || 0)}</p>
                <p className="text-sm text-gray-500">הרווחים</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <Star className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
                <p className="text-2xl font-bold">{parseFloat(courier.rating || 5).toFixed(1)}</p>
                <p className="text-sm text-gray-500">דירוג</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Package className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                <p className="text-2xl font-bold">{courier.total_deliveries || 0}</p>
                <p className="text-sm text-gray-500">סה"כ</p>
              </div>
            </div>
          </div>

          {/* Recent Deliveries */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">משלוחים אחרונים</h3>
            {courier.recent_deliveries?.length > 0 ? (
              <div className="space-y-3">
                {courier.recent_deliveries.map((delivery) => {
                  const status = deliveryStatusConfig[delivery.status]
                  return (
                    <div key={delivery.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <span className="font-medium">#{delivery.delivery_number}</span>
                        <p className="text-sm text-gray-500">
                          {delivery.pickup_city} ← {delivery.dropoff_city}
                        </p>
                      </div>
                      <div className="text-left">
                        <span className={`badge badge-${status.color}`}>{status.label}</span>
                        <p className="text-sm font-medium mt-1">{formatCurrency(delivery.courier_payment)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">אין משלוחים אחרונים</p>
            )}
          </div>

          {/* Bank Account */}
          {courier.bank_account && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">פרטי חשבון בנק</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">בנק</p>
                  <p className="font-medium">{courier.bank_account.bank_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">סניף</p>
                  <p className="font-medium">{courier.bank_account.branch}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">מספר חשבון</p>
                  <p className="font-medium">{courier.bank_account.account_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">שם בעל החשבון</p>
                  <p className="font-medium">{courier.bank_account.owner_name}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
