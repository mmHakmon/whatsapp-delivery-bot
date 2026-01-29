const pricingService = require('./pricing.service');

const calculatorService = {
  // מחשבון מחירים מהיר
  async quickCalculate(req, res) {
    try {
      const { pickupAddress, deliveryAddress, vehicleType, isNightDelivery } = req.body;

      // חישוב מרחק
      const { distanceKm, durationMinutes } = await pricingService.calculateDistance(
        pickupAddress,
        deliveryAddress
      );

      // חישוב מחיר
      const pricing = pricingService.calculatePrice(vehicleType, distanceKm, isNightDelivery);

      return {
        distance: distanceKm,
        estimatedTime: durationMinutes,
        pricing,
        breakdown: {
          basePrice: pricing.basePrice,
          distancePrice: (pricing.chargeableKm * pricing.pricePerKm).toFixed(2),
          nightSurcharge: pricing.nightSurcharge,
          subtotal: pricing.totalPrice,
          vat: pricing.vatAmount,
          total: pricing.finalPrice,
          courierEarnings: pricing.courierEarnings,
          companyEarnings: pricing.companyEarnings
        }
      };
    } catch (error) {
      throw error;
    }
  }
};

module.exports = calculatorService;
