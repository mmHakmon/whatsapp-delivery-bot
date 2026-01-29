import { useEffect, useState } from 'react';
import { couriersAPI } from '../../services/api';
import { X, TrendingUp, Package, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';

export default function CourierStats({ courier, onClose }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState('30');

  useEffect(() => {
    loadStats();
  }, [period]);

  const loadStats = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      const { data } = await couriersAPI.getStats(courier.id, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      setStats(data);
    } catch (error) {
      toast.error('שגיאה בטעינת סטטיסטיקות');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{courier.name}</h2>
            <p className="text-gray-600 mt-1">סטטיסטיקות וביצועים</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Period Selector */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-2">
            {[
              { value: '7', label: '7 ימים' },
              { value: '30', label: '30 ימים' },
              { value: '90', label: '90 ימים' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setPeriod(option.value)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  period === option.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={Package}
                title="סה״כ משלוחים"
                value={stats?.totalStats.totalDeliveries || 0}
                color="blue"
              />
              <StatCard
                icon={CheckCircle}
                title="הושלמו"
                value={stats?.totalStats.completedDeliveries || 0}
                color="green"
              />
              <StatCard
                icon={XCircle}
                title="בוטלו"
                value={stats?.totalStats.cancelledDeliveries || 0}
                color="red"
              />
              <StatCard
                icon={DollarSign}
                title="סה״כ רווחים"
                value={formatCurrency(stats?.totalStats.totalEarnings || 0)}
                color="purple"
              />
            </div>

            {/* Performance Table */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">ביצועים יומיים</h3>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        תאריך
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        משלוחים
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        הושלמו
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        בוטלו
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        רווחים
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats?.performance.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                          אין נתונים לתקופה זו
                        </td>
                      </tr>
                    ) : (
                      stats?.performance.map((day) => (
                        <tr key={day.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(day.date).toLocaleDateString('he-IL')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {day.totalDeliveries}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                            {day.completedDeliveries}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                            {day.cancelledDeliveries}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(day.totalEarnings)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Additional Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">שיעור השלמה</h4>
                <p className="text-3xl font-bold text-blue-600">
                  {stats?.totalStats.totalDeliveries > 0
                    ? Math.round((stats.totalStats.completedDeliveries / stats.totalStats.totalDeliveries) * 100)
                    : 0}%
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-green-900 mb-2">ממוצע רווח למשלוח</h4>
                <p className="text-3xl font-bold text-green-600">
                  {stats?.totalStats.completedDeliveries > 0
                    ? formatCurrency(stats.totalStats.totalEarnings / stats.totalStats.completedDeliveries)
                    : formatCurrency(0)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xs text-gray-600 mb-1">{title}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
