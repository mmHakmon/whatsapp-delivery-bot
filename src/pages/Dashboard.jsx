import { useEffect, useState } from 'react';
import { dashboardAPI } from '../services/api';
import { 
  Package, 
  Truck, 
  TrendingUp, 
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { formatCurrency, formatRelativeTime, getStatusLabel, getStatusColor } from '../utils/formatters';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [activeDeliveries, setActiveDeliveries] = useState([]);
  const [activeCouriers, setActiveCouriers] = useState([]);

  useEffect(() => {
    loadDashboard();
    // רענון כל 30 שניות
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async () => {
    try {
      const [realtimeRes, deliveriesRes, couriersRes] = await Promise.all([
        dashboardAPI.getRealtime(),
        dashboardAPI.getActiveDeliveries(),
        dashboardAPI.getActiveCouriers(),
      ]);

      setStats(realtimeRes.data.stats);
      setActiveDeliveries(deliveriesRes.data.deliveries);
      setActiveCouriers(couriersRes.data.couriers);
    } catch (error) {
      toast.error('שגיאה בטעינת דאשבורד');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">דאשבורד</h1>
        <p className="text-gray-600 mt-1">סקירה כללית של המערכת</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="משלוחים היום"
          value={stats?.today.total || 0}
          icon={Package}
          color="blue"
        />
        <StatCard
          title="משלוחים פעילים"
          value={stats?.today.active || 0}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="משלוחים שהושלמו"
          value={stats?.today.completed || 0}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          title="הכנסות היום"
          value={formatCurrency(stats?.today.revenue || 0)}
          icon={DollarSign}
          color="purple"
          isAmount
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">שליחים</h3>
            <Truck className="w-5 h-5 text-gray-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">זמינים</span>
              <span className="font-semibold text-green-600">
                {stats?.couriers.available || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">עסוקים</span>
              <span className="font-semibold text-yellow-600">
                {stats?.couriers.busy || 0}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">סה"כ פעילים</span>
              <span className="font-semibold text-blue-600">
                {stats?.couriers.total || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">התראות</h3>
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">
              {stats?.alerts || 0}
            </div>
            <p className="text-sm text-gray-600 mt-1">התראות פתוחות</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">ביצועים</h3>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">שיעור השלמה</span>
              <span className="font-semibold text-green-600">
                {stats?.today.total > 0
                  ? Math.round((stats.today.completed / stats.today.total) * 100)
                  : 0}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">רווח חברה</span>
              <span className="font-semibold text-blue-600">
                {formatCurrency(stats?.today.companyEarnings || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Deliveries */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">משלוחים פעילים</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  מספר הזמנה
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  סטטוס
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  שליח
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  מרחק
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  מחיר
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  זמן
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activeDeliveries.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    אין משלוחים פעילים כרגע
                  </td>
                </tr>
              ) : (
                activeDeliveries.slice(0, 10).map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-medium text-gray-900">
                        {delivery.orderNumber}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(delivery.status)}`}>
                        {getStatusLabel(delivery.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {delivery.courier?.name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {delivery.distance ? `${delivery.distance} ק"מ` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(delivery.finalPrice)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatRelativeTime(delivery.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, isAmount }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className={`text-2xl font-bold text-gray-900 ${isAmount ? 'text-xl' : ''}`}>
            {value}
          </p>
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
