import { useEffect, useState } from 'react';
import { deliveriesAPI } from '../services/api';
import { Plus, Search, Filter, Download, Eye, X, MapPin } from 'lucide-react';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor, getVehicleTypeLabel } from '../utils/formatters';
import toast from 'react-hot-toast';
import DeliveryForm from '../components/deliveries/DeliveryForm';
import DeliveryDetails from '../components/deliveries/DeliveryDetails';

export default function Deliveries() {
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState([]);
  const [filteredDeliveries, setFilteredDeliveries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadDeliveries();
  }, []);

  useEffect(() => {
    filterDeliveries();
  }, [deliveries, searchTerm, statusFilter]);

  const loadDeliveries = async () => {
    try {
      const { data } = await deliveriesAPI.getAll();
      setDeliveries(data.deliveries);
      setFilteredDeliveries(data.deliveries);
    } catch (error) {
      toast.error('שגיאה בטעינת משלוחים');
    } finally {
      setLoading(false);
    }
  };

  const filterDeliveries = () => {
    let filtered = deliveries;

    // חיפוש
    if (searchTerm) {
      filtered = filtered.filter(d =>
        d.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.customerFromName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.customerToName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.pickupAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.deliveryAddress?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // סינון לפי סטטוס
    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === statusFilter);
    }

    setFilteredDeliveries(filtered);
  };

  const handleCancelDelivery = async (delivery) => {
    if (!confirm(`האם לבטל את משלוח ${delivery.orderNumber}?`)) return;

    try {
      await deliveriesAPI.cancel(delivery.id, 'בוטל על ידי מנהל');
      toast.success('המשלוח בוטל בהצלחה');
      loadDeliveries();
    } catch (error) {
      toast.error('שגיאה בביטול משלוח');
    }
  };

  const handleExport = () => {
    // TODO: implement export
    toast.success('מייצא לאקסל...');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">משלוחים</h1>
          <p className="text-gray-600 mt-1">ניהול כל המשלוחים במערכת</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>משלוח חדש</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חיפוש לפי מספר הזמנה, שם לקוח, כתובת..."
              className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="pending">ממתין</option>
            <option value="published">מפורסם</option>
            <option value="claimed">נתפס</option>
            <option value="picked_up">נאסף</option>
            <option value="delivered">נמסר</option>
            <option value="completed">הושלם</option>
            <option value="cancelled">בוטל</option>
          </select>

          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-5 h-5" />
            <span>ייצא</span>
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-4 pt-4 border-t border-gray-200">
          <div>
            <span className="text-sm text-gray-600">סה"כ משלוחים: </span>
            <span className="font-semibold text-gray-900">{filteredDeliveries.length}</span>
          </div>
          <div>
            <span className="text-sm text-gray-600">פעילים: </span>
            <span className="font-semibold text-yellow-600">
              {filteredDeliveries.filter(d => ['published', 'claimed', 'picked_up'].includes(d.status)).length}
            </span>
          </div>
          <div>
            <span className="text-sm text-gray-600">הושלמו: </span>
            <span className="font-semibold text-green-600">
              {filteredDeliveries.filter(d => d.status === 'completed').length}
            </span>
          </div>
        </div>
      </div>

      {/* Deliveries Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  מספר הזמנה
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  תאריך
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  סוג רכב
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  איסוף
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  מסירה
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  שליח
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  סטטוס
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  מחיר
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDeliveries.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-8 text-center text-gray-500">
                    לא נמצאו משלוחים
                  </td>
                </tr>
              ) : (
                filteredDeliveries.map((delivery) => (
                  <tr key={delivery.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-medium text-blue-600">
                        {delivery.orderNumber}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(delivery.createdAt, 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {getVehicleTypeLabel(delivery.vehicleType)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {delivery.pickupAddress}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {delivery.deliveryAddress}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {delivery.courier?.name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(delivery.status)}`}>
                        {getStatusLabel(delivery.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(delivery.finalPrice)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedDelivery(delivery)}
                          className="text-blue-600 hover:text-blue-700"
                          title="צפייה בפרטים"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {delivery.status !== 'cancelled' && delivery.status !== 'completed' && (
                          <button
                            onClick={() => handleCancelDelivery(delivery)}
                            className="text-red-600 hover:text-red-700"
                            title="ביטול משלוח"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <DeliveryForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            loadDeliveries();
          }}
        />
      )}

      {selectedDelivery && (
        <DeliveryDetails
          delivery={selectedDelivery}
          onClose={() => setSelectedDelivery(null)}
          onUpdate={loadDeliveries}
        />
      )}
    </div>
  );
}
