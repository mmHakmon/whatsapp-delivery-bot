import { useEffect, useState } from 'react';
import { couriersAPI } from '../services/api';
import { Plus, Search, UserX, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { formatCurrency, formatPhone, getVehicleTypeLabel } from '../utils/formatters';
import toast from 'react-hot-toast';
import CourierForm from '../components/couriers/CourierForm';
import CourierStats from '../components/couriers/CourierStats';

export default function Couriers() {
  const [loading, setLoading] = useState(true);
  const [couriers, setCouriers] = useState([]);
  const [filteredCouriers, setFilteredCouriers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState(null);

  useEffect(() => {
    loadCouriers();
  }, []);

  useEffect(() => {
    filterCouriers();
  }, [couriers, searchTerm]);

  const loadCouriers = async () => {
    try {
      const { data } = await couriersAPI.getAll();
      setCouriers(data.couriers);
      setFilteredCouriers(data.couriers);
    } catch (error) {
      toast.error('שגיאה בטעינת שליחים');
    } finally {
      setLoading(false);
    }
  };

  const filterCouriers = () => {
    let filtered = couriers;

    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)
      );
    }

    setFilteredCouriers(filtered);
  };

  const handleToggleActive = async (courier) => {
    try {
      await couriersAPI.update(courier.id, { isActive: !courier.isActive });
      toast.success(`שליח ${courier.isActive ? 'הושבת' : 'הופעל'} בהצלחה`);
      loadCouriers();
    } catch (error) {
      toast.error('שגיאה בעדכון שליח');
    }
  };

  const handleAddToBlacklist = async (courier) => {
    const reason = prompt('סיבת חסימה:');
    if (!reason) return;

    const duration = prompt('משך החסימה בשעות (השאר ריק לצמיתות):');

    try {
      await couriersAPI.addToBlacklist(courier.id, {
        reason,
        duration: duration ? parseInt(duration) : null,
      });
      toast.success('השליח נוסף לרשימה השחורה');
      loadCouriers();
    } catch (error) {
      toast.error('שגיאה בהוספה לרשימה שחורה');
    }
  };

  const handleRemoveFromBlacklist = async (courier) => {
    if (!confirm('האם להסיר שליח מרשימה שחורה?')) return;

    try {
      await couriersAPI.removeFromBlacklist(courier.id);
      toast.success('השליח הוסר מהרשימה השחורה');
      loadCouriers();
    } catch (error) {
      toast.error('שגיאה בהסרה מרשימה שחורה');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">שליחים</h1>
          <p className="text-gray-600 mt-1">ניהול כל השליחים במערכת</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>שליח חדש</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="סה״כ שליחים"
          value={couriers.length}
          color="blue"
        />
        <StatCard
          title="פעילים"
          value={couriers.filter(c => c.isActive).length}
          color="green"
        />
        <StatCard
          title="זמינים"
          value={couriers.filter(c => c.isActive && c.isAvailable).length}
          color="yellow"
        />
        <StatCard
          title="חסומים"
          value={couriers.filter(c => c.blacklistEntries?.some(b => b.isActive)).length}
          color="red"
        />
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="חיפוש שליח לפי שם או טלפון..."
            className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Couriers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCouriers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            לא נמצאו שליחים
          </div>
        ) : (
          filteredCouriers.map((courier) => (
            <CourierCard
              key={courier.id}
              courier={courier}
              onToggleActive={handleToggleActive}
              onAddToBlacklist={handleAddToBlacklist}
              onRemoveFromBlacklist={handleRemoveFromBlacklist}
              onViewStats={() => setSelectedCourier(courier)}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <CourierForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            loadCouriers();
          }}
        />
      )}

      {selectedCourier && (
        <CourierStats
          courier={selectedCourier}
          onClose={() => setSelectedCourier(null)}
        />
      )}
    </div>
  );
}

function StatCard({ title, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function CourierCard({ courier, onToggleActive, onAddToBlacklist, onRemoveFromBlacklist, onViewStats }) {
  const isBlacklisted = courier.blacklistEntries?.some(b => b.isActive);

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${isBlacklisted ? 'border-2 border-red-300' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">{courier.name}</h3>
          <p className="text-sm text-gray-600">{formatPhone(courier.phone)}</p>
        </div>
        <div className={`w-3 h-3 rounded-full ${
          courier.isActive && courier.isAvailable ? 'bg-green-500' :
          courier.isActive ? 'bg-yellow-500' : 'bg-gray-300'
        }`} />
      </div>

      {/* Info */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">סוג רכב:</span>
          <span className="font-medium text-gray-900">{getVehicleTypeLabel(courier.vehicleType)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">דירוג:</span>
          <span className="font-medium text-gray-900">⭐ {courier.rating.toFixed(1)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">משלוחים:</span>
          <span className="font-medium text-gray-900">{courier.completedDeliveries}/{courier.totalDeliveries}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">רווחים:</span>
          <span className="font-medium text-green-600">{formatCurrency(courier.totalEarnings)}</span>
        </div>
      </div>

      {/* Status */}
      {isBlacklisted && (
        <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
          🚫 ברשימה שחורה
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onViewStats(courier)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <TrendingUp className="w-4 h-4" />
          <span>סטטיסטיקות</span>
        </button>
        
        {isBlacklisted ? (
          <button
            onClick={() => onRemoveFromBlacklist(courier)}
            className="px-3 py-2 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
            title="הסר מרשימה שחורה"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => onAddToBlacklist(courier)}
            className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            title="הוסף לרשימה שחורה"
          >
            <UserX className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => onToggleActive(courier)}
          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
            courier.isActive
              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              : 'bg-green-50 text-green-600 hover:bg-green-100'
          }`}
          title={courier.isActive ? 'השבת' : 'הפעל'}
        >
          {courier.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
