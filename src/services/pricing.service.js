const axios = require('axios');

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY;

const pricingService = {
  // חישוב מרחק בין שתי כתובות
  async calculateDistance(origin, destination) {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
        params: {
          origins: origin,
          destinations: destination,
          key: GOOGLE_MAPS_KEY,
          language: 'he'
        }
      });

      if (response.data.rows[0].elements[0].status === 'OK') {
        const distanceMeters = response.data.rows[0].elements[0].distance.value;
        const distanceKm = distanceMeters / 1000;
        const durationSeconds = response.data.rows[0].elements[0].duration.value;
        const durationMinutes = Math.ceil(durationSeconds / 60);

        return {
          distanceKm: Math.round(distanceKm * 10) / 10,
          durationMinutes
        };
      } else {
        throw new Error('לא ניתן לחשב מרחק');
      }
    } catch (error) {
      console.error('Distance calculation error:', error);
      throw error;
    }
  },

  // חישוב מחיר משלוח
  calculatePrice(vehicleType, distanceKm, isNightDelivery = false) {
    const basePrice = parseFloat(process.env[`${vehicleType.toUpperCase()}_BASE_PRICE`]);
    const pricePerKm = parseFloat(process.env[`${vehicleType.toUpperCase()}_PRICE_PER_KM`]);
    const vatRate = parseFloat(process.env.VAT_RATE);
    const commissionRate = parseFloat(process.env.COMMISSION_RATE);
    const freeKm = parseFloat(process.env.FREE_KM);

    // חישוב מרחק לחיוב (אחרי ק"מ חינם)
    const chargeableKm = Math.max(0, distanceKm - freeKm);

    // מחיר בסיס + מחיר לפי ק"מ
    let totalPrice = basePrice + (chargeableKm * pricePerKm);

    // תוספת לילה (אם רלוונטי)
    let nightSurcharge = 0;
    if (isNightDelivery) {
      nightSurcharge = totalPrice * 0.5; // 50% תוספת
      totalPrice += nightSurcharge;
    }

    // מע"מ
    const vatAmount = totalPrice * vatRate;
    const finalPrice = totalPrice + vatAmount;

    // רווחים
    const courierEarnings = finalPrice * (1 - commissionRate);
    const companyEarnings = finalPrice * commissionRate;

    return {
      basePrice,
      pricePerKm,
      distance: distanceKm,
      chargeableKm,
      totalPrice: Math.round(totalPrice * 100) / 100,
      nightSurcharge: Math.round(nightSurcharge * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      finalPrice: Math.round(finalPrice * 100) / 100,
      courierEarnings: Math.round(courierEarnings * 100) / 100,
      companyEarnings: Math.round(companyEarnings * 100) / 100
    };
  },

  // בדיקה אם זה משלוח לילה (22:00-06:00)
  isNightTime() {
    const hour = new Date().getHours();
    return hour >= 22 || hour < 6;
  }
};

module.exports = pricingService;
