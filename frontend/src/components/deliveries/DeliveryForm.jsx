import { useState } from 'react';
import { deliveriesAPI, calculatorAPI } from '../../services/api';
import { X, MapPin, Calculator } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';

export default function DeliveryForm({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [priceInfo, setPriceInfo] = useState(null);
  const [formData, setFormData] = useState({
    vehicleType: 'car',
    packageType: 'package',
    pickupAddress: '',
    deliveryAddress: '',
    customerFromPhone: '',
    customerFromName: '',
    customerToPhone: '',
    customerToName: '',
    notes: '',
    priority: 0,
  });

  const handleCalculate = async () => {
    if (!formData.pickupAddress || !formData.deliveryAddress || !formData.vehicleType) {
      toast.error('נא למלא כתובת איסוף, מסירה וסוג רכב');
      return;
    }

    setCalculating(true);
    try {
      const { data } = await calculatorAPI.calculatePrice({
        pickupAddress: formData.pickupAddress,
        deliveryAddress: formData.deliveryAddress,
        vehicleType: formData.vehicleType,
        isNightDelivery: false,
      });
      setPriceInfo(data);
      toast.success('מחיר חושב בהצלחה!');
    } catch (error) {
      toast.error('שגיאה בחישוב מחיר');
    } finally {
      setCalculating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await deliveriesAPI.create(formData);
      toast.success('המשלוח נוצר ופורסם לשליחים!');
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.error || 'שגיאה ביצירת משלוח');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">משלוח חדש</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Vehicle Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סוג רכב *
            </label>
            <select
              value={formData.vehicleType}
              onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="motorcycle">אופנוע</option>
              <option value="car">רכב</option>
              <option value="van">טנדר</option>
              <option value="truck">משאית</option>
            </select>
          </div>

          {/* Package Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              סוג חבילה
            </label>
            <select
              value={formData.packageType}
              onChange={(e) => setFormData({ ...formData, packageType: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="document">מסמך</option>
              <option value="package">חבילה</option>
              <option value="food">אוכל</option>
              <option value="other">אחר</option>
            </select>
          </div>

          {/* Addresses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4 inline ml-1" />
                כתובת איסוף *
              </label>
              <input
                type="text"
                value={formData.pickupAddress}
                onChange={(e) => setFormData({ ...formData, pickupAddress: e.target.value })}
                placeholder="רחוב 1, תל אביב"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <MapPin className="w-4 h-4 inline ml-1" />
                כתובת מסירה *
              </label>
              <input
                type="text"
                value={formData.deliveryAddress}
                onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                placeholder="רחוב 2, תל אביב"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Calculate Price */}
          <div>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={calculating}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Calculator className="w-4 h-4" />
              <span>{calculating ? 'מחשב...' : 'חישוב מחיר'}</span>
            </button>

            {priceInfo && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">מרחק:</span>
                    <span className="font-semibold mr-2">{priceInfo.distance} ק"מ</span>
                  </div>
                  <div>
                    <span className="text-gray-600">זמן משוער:</span>
                    <span className="font-semibold mr-2">{priceInfo.estimatedTime} דקות</span>
                  </div>
                  <div>
                    <span className="text-gray-600">מחיר בסיס:</span>
                    <span className="font-semibold mr-2">{formatCurrency(priceInfo.pricing.basePrice)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">מחיר סופי:</span>
                    <span className="font-semibold text-blue-600 mr-2 text-lg">
                      {formatCurrency(priceInfo.pricing.finalPrice)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">רווח שליח:</span>
                    <span className="font-semibold mr-2">{formatCurrency(priceInfo.pricing.courierEarnings)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">רווח חברה:</span>
                    <span className="font-semibold mr-2">{formatCurrency(priceInfo.pricing.companyEarnings)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Customer From */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                שם שולח
              </label>
              <input
                type="text"
                value={formData.customerFromName}
                onChange={(e) => setFormData({ ...formData, customerFromName: e.target.value })}
                placeholder="שם מלא"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                טלפון שולח
              </label>
              <input
                type="tel"
                value={formData.customerFromPhone}
                onChange={(e) => setFormData({ ...formData, customerFromPhone: e.target.value })}
                placeholder="972501234567"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Customer To */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                שם מקבל
              </label>
              <input
                type="text"
                value={formData.customerToName}
                onChange={(e) => setFormData({ ...formData, customerToName: e.target.value })}
                placeholder="שם מלא"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                טלפון מקבל
              </label>
              <input
                type="tel"
                value={formData.customerToPhone}
                onChange={(e) => setFormData({ ...formData, customerToPhone: e.target.value })}
                placeholder="972507654321"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              הערות
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות נוספות למשלוח..."
              rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              עדיפות
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="0">רגיל</option>
              <option value="1">גבוהה</option>
              <option value="2">דחוף</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'יוצר...' : 'יצירה ופרסום'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
