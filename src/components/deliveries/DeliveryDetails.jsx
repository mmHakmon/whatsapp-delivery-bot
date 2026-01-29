import { X, MapPin, User, Phone, Package, Clock, DollarSign, Navigation } from 'lucide-react';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor, getVehicleTypeLabel } from '../../utils/formatters';

export default function DeliveryDetails({ delivery, onClose, onUpdate }) {
  const handleNavigation = (address) => {
    const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(address)}`;
    window.open(wazeUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">פרטי משלוח</h2>
            <p className="text-gray-600 mt-1">{delivery.orderNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">סטטוס</h3>
            <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(delivery.status)}`}>
              {getStatusLabel(delivery.status)}
            </span>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">סוג רכב</h3>
              <p className="text-gray-900">{getVehicleTypeLabel(delivery.vehicleType)}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">סוג חבילה</h3>
              <p className="text-gray-900">{delivery.packageType || '-'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">מרחק</h3>
              <p className="text-gray-900">{delivery.distance ? `${delivery.distance} ק"מ` : '-'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">תאריך יצירה</h3>
              <p className="text-gray-900">{formatDate(delivery.createdAt)}</p>
            </div>
          </div>

          {/* Addresses */}
          <div className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-green-800 mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    כתובת איסוף
                  </h3>
                  <p className="text-gray-900">{delivery.pickupAddress}</p>
                  {delivery.customerFromName && (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-gray-700">
                        <User className="w-3 h-3 inline ml-1" />
                        {delivery.customerFromName}
                      </p>
                      {delivery.customerFromPhone && (
                        <p className="text-sm text-gray-700">
                          <Phone className="w-3 h-3 inline ml-1" />
                          {delivery.customerFromPhone}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleNavigation(delivery.pickupAddress)}
                  className="text-green-600 hover:text-green-700"
                  title="נווט ב-Waze"
                >
                  <Navigation className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    כתובת מסירה
                  </h3>
                  <p className="text-gray-900">{delivery.deliveryAddress}</p>
                  {delivery.customerToName && (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm text-gray-700">
                        <User className="w-3 h-3 inline ml-1" />
                        {delivery.customerToName}
                      </p>
                      {delivery.customerToPhone && (
                        <p className="text-sm text-gray-700">
                          <Phone className="w-3 h-3 inline ml-1" />
                          {delivery.customerToPhone}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleNavigation(delivery.deliveryAddress)}
                  className="text-blue-600 hover:text-blue-700"
                  title="נווט ב-Waze"
                >
                  <Navigation className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Courier */}
          {delivery.courier && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">שליח</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium text-gray-900">{delivery.courier.name}</p>
                <p className="text-sm text-gray-600">{delivery.courier.phone}</p>
                <p className="text-sm text-gray-600">{getVehicleTypeLabel(delivery.courier.vehicleType)}</p>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">ציר זמן</h3>
            <div className="space-y-3">
              {delivery.createdAt && (
                <TimelineItem
                  icon={Package}
                  title="נוצר"
                  time={formatDate(delivery.createdAt)}
                  active
                />
              )}
              {delivery.publishedAt && (
                <TimelineItem
                  icon={Clock}
                  title="פורסם"
                  time={formatDate(delivery.publishedAt)}
                  active
                />
              )}
              {delivery.claimedAt && (
                <TimelineItem
                  icon={User}
                  title="נתפס"
                  time={formatDate(delivery.claimedAt)}
                  active
                />
              )}
              {delivery.pickedUpAt && (
                <TimelineItem
                  icon={Package}
                  title="נאסף"
                  time={formatDate(delivery.pickedUpAt)}
                  active
                />
              )}
              {delivery.deliveredAt && (
                <TimelineItem
                  icon={MapPin}
                  title="נמסר"
                  time={formatDate(delivery.deliveredAt)}
                  active
                />
              )}
              {delivery.completedAt && (
                <TimelineItem
                  icon={Package}
                  title="הושלם"
                  time={formatDate(delivery.completedAt)}
                  active
                />
              )}
            </div>
          </div>

          {/* Pricing */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">תמחור</h3>
            <div className="bg-purple-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">מחיר בסיס:</span>
                <span className="font-medium text-gray-900">{formatCurrency(delivery.basePrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">מחיר לפי ק"מ:</span>
                <span className="font-medium text-gray-900">{formatCurrency(delivery.pricePerKm)}/ק"מ</span>
              </div>
              {delivery.nightSurcharge > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">תוספת לילה:</span>
                  <span className="font-medium text-gray-900">{formatCurrency(delivery.nightSurcharge)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">סכום ביניים:</span>
                <span className="font-medium text-gray-900">{formatCurrency(delivery.totalPrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">מע"מ:</span>
                <span className="font-medium text-gray-900">{formatCurrency(delivery.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t border-purple-200">
                <span className="font-semibold text-gray-900">מחיר סופי:</span>
                <span className="font-bold text-purple-600 text-lg">{formatCurrency(delivery.finalPrice)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-purple-200">
                <span className="text-gray-700">רווח שליח:</span>
                <span className="font-medium text-green-600">{formatCurrency(delivery.courierEarnings)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">רווח חברה:</span>
                <span className="font-medium text-blue-600">{formatCurrency(delivery.companyEarnings)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {delivery.notes && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">הערות</h3>
              <p className="text-gray-900 bg-gray-50 p-4 rounded-lg">{delivery.notes}</p>
            </div>
          )}
        </div>

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

function TimelineItem({ icon: Icon, title, time, active }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
        active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-500'}`}>
          {title}
        </p>
        <p className="text-xs text-gray-500">{time}</p>
      </div>
    </div>
  );
}
