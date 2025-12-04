import { useQuery } from '@tanstack/react-query'
import {
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Users,
  TrendingUp,
  Clock,
  DollarSign,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import api from '../utils/api'
import { formatCurrency, formatDateTime, deliveryStatusConfig, cn } from '../utils/helpers'

function StatCard({ title, value, icon: Icon, color, change }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {change && (
            <p className={cn('text-sm mt-1', change > 0 ? 'text-green-600' : 'text-red-600')}>
              {change > 0 ? '+' : ''}{change}% מאתמול
            </p>
          )}
        </div>
        <div className={cn('h-12 w-12 rounded-lg flex items-center justify-center', color)}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  )
}

function ActiveDeliveryCard({ delivery }) {
  const status = deliveryStatusConfig[delivery.status]
  
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">#{delivery.delivery_number}</span>
          <span className={`badge badge-${status.color}`}>{status.label}</span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {delivery.pickup_city} ← {delivery.dropoff_city}
        </p>
        {delivery.courier_name && (
          <p className="text-sm text-gray-600 mt-1">שליח: {delivery.courier_name}</p>
        )}
      </div>
      <div className="text-left">
        <p className="font-medium text-whatsapp-dark">{formatCurrency(delivery.total_price)}</p>
        <p className="text-xs text-gray-500">{formatDateTime(delivery.created_at)}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get('/dashboard/overview').then(res => res.data.overview),
    refetchInterval: 30000,
  })

  const { data: activeDeliveries } = useQuery({
    queryKey: ['active-deliveries'],
    queryFn: () => api.get('/dashboard/active-deliveries').then(res => res.data.deliveries),
    refetchInterval: 10000,
  })

  const { data: chartData } = useQuery({
    queryKey: ['deliveries-chart'],
    queryFn: () => api.get('/dashboard/charts/deliveries?days=14').then(res => res.data.data),
  })

  const { data: topCouriers } = useQuery({
    queryKey: ['top-couriers'],
    queryFn: () => api.get('/dashboard/top-couriers?period=month').then(res => res.data.couriers),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-whatsapp-light border-t-transparent rounded-full" />
      </div>
    )
  }

  const stats = [
    {
      title: 'משלוחים היום',
      value: overview?.today?.total || 0,
      icon: Package,
      color: 'bg-blue-500',
    },
    {
      title: 'הושלמו',
      value: overview?.today?.completed || 0,
      icon: CheckCircle,
      color: 'bg-green-500',
    },
    {
      title: 'בביצוע',
      value: (overview?.today?.active?.assigned || 0) + (overview?.today?.active?.in_transit || 0),
      icon: Truck,
      color: 'bg-orange-500',
    },
    {
      title: 'שליחים פעילים',
      value: overview?.couriers?.online_today || 0,
      icon: Users,
      color: 'bg-purple-500',
    },
    {
      title: 'הכנסות היום',
      value: formatCurrency(overview?.today?.total_revenue || 0),
      icon: DollarSign,
      color: 'bg-whatsapp-dark',
    },
    {
      title: 'תשלומים ממתינים',
      value: formatCurrency(overview?.payments?.pending_amount || 0),
      icon: Clock,
      color: 'bg-yellow-500',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">דשבורד</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          מתעדכן בזמן אמת
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deliveries Chart */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold mb-4">משלוחים - 14 ימים אחרונים</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(val) => new Date(val).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(val) => new Date(val).toLocaleDateString('he-IL')}
                  formatter={(value, name) => [value, name === 'completed' ? 'הושלמו' : name === 'total' ? 'סה"כ' : name]}
                />
                <Line type="monotone" dataKey="total" stroke="#128C7E" strokeWidth={2} name="סה״כ" />
                <Line type="monotone" dataKey="completed" stroke="#25D366" strokeWidth={2} name="הושלמו" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Couriers */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">שליחים מובילים החודש</h2>
          <div className="space-y-3">
            {topCouriers?.slice(0, 5).map((courier, index) => (
              <div key={courier.id} className="flex items-center gap-3">
                <span className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-sm',
                  index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-600' : 'bg-gray-300'
                )}>
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{courier.name}</p>
                  <p className="text-sm text-gray-500">{courier.deliveries_count} משלוחים</p>
                </div>
                <span className="font-medium text-whatsapp-dark">
                  {formatCurrency(courier.total_earnings)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Deliveries */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">משלוחים פעילים</h2>
          <span className="badge badge-info">
            {activeDeliveries?.length || 0} משלוחים
          </span>
        </div>
        
        {activeDeliveries?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeDeliveries.slice(0, 6).map((delivery) => (
              <ActiveDeliveryCard key={delivery.id} delivery={delivery} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">אין משלוחים פעילים כרגע</p>
        )}
      </div>
    </div>
  )
}
