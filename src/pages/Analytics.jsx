import { useEffect, useState } from 'react';
import { analyticsAPI } from '../services/api';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, MapPin, Clock } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import toast from 'react-hot-toast';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [performanceData, setPerformanceData] = useState(null);
  const [courierData, setCourierData] = useState([]);
  const [zoneData, setZoneData] = useState([]);
  const [peakTimesData, setPeakTimesData] = useState(null);

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      const params = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        groupBy: period === '7' ? 'day' : 'day',
      };

      const [performance, couriers, zones, peakTimes] = await Promise.all([
        analyticsAPI.getPerformance(params),
        analyticsAPI.getCouriers(params),
        analyticsAPI.getZones(params),
        analyticsAPI.getPeakTimes({ days: period }),
      ]);

      setPerformanceData(performance.data);
      setCourierData(couriers.data.couriers);
      setZoneData(zones.data.zones);
      setPeakTimesData(peakTimes.data);
    } catch (error) {
      toast.error('שגיאה בטעינת ניתוחים');
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

  // הכנת נתונים לגרפים
  const performanceChartData = performanceData?.data
    ? Object.keys(performanceData.data).map(key => ({
        date: key,
        total: performanceData.data[key].total,
        completed: performanceData.data[key].completed,
        revenue: performanceData.data[key].revenue,
      }))
    : [];

  const topCouriers = courierData.slice(0, 10);
  const topZones = zoneData.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ניתוחים</h1>
          <p className="text-gray-600 mt-1">ניתוח ביצועים ותובנות עסקיות</p>
        </div>

        {/* Period Selector */}
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
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Performance Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          ביצועים לאורך זמן
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={performanceChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="left" />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="total" stroke="#3B82F6" name="סה״כ משלוחים" />
            <Line yAxisId="left" type="monotone" dataKey="completed" stroke="#10B981" name="הושלמו" />
            <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#8B5CF6" name="הכנסות (₪)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Couriers & Zones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Couriers */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            שליחים מובילים
          </h2>
          <div className="space-y-3">
            {topCouriers.map((courier, index) => (
              <div key={courier.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{courier.name}</p>
                    <p className="text-xs text-gray-600">
                      {courier.stats.completed} משלוחים | ⭐ {courier.rating}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="font-semibold text-green-600">
                    {formatCurrency(courier.stats.totalEarnings)}
                  </p>
                  <p className="text-xs text-gray-600">
                    {courier.stats.completionRate}% השלמה
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Zones */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            אזורים פופולריים
          </h2>
          <div className="space-y-3">
            {topZones.map((zone, index) => (
              <div key={zone.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{zone.name}</p>
                    <p className="text-xs text-gray-600">
                      {zone.pickups} איסופים | {zone.deliveries} מסירות
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className="font-semibold text-blue-600">
                    {formatCurrency(zone.totalRevenue)}
                  </p>
                  <p className="text-xs text-gray-600">
                    ממוצע {zone.avgDistance} ק״מ
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peak Times */}
      {peakTimesData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hourly */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              שעות שיא
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={peakTimesData.hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3B82F6" name="משלוחים" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weekly */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              ימים בשבוע
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={peakTimesData.weeklyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#10B981" name="משלוחים" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
