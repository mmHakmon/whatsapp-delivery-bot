/**
 * M.M.H Delivery System Pro v4.0
 * Google Maps Integration Module
 * 
 * Distance calculation and price estimation
 */

const axios = require('axios');
const { CONFIG } = require('../config');

// ══════════════════════════════════════════════════════════════
// DISTANCE CALCULATION
// ══════════════════════════════════════════════════════════════

/**
 * Calculate distance between two addresses using Google Maps
 */
const calculateDistance = async (origin, destination) => {
  // If no API key, return null
  if (!CONFIG.GOOGLE_API_KEY) {
    console.log('⚠️ Google Maps API key not configured');
    return null;
  }
  
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
    
    const response = await axios.get(url, {
      params: {
        origins: origin,
        destinations: destination,
        mode: 'driving',
        language: 'he',
        key: CONFIG.GOOGLE_API_KEY
      },
      timeout: 10000
    });
    
    const data = response.data;
    
    if (data.status !== 'OK') {
      console.error('❌ Google Maps API error:', data.status);
      return null;
    }
    
    const element = data.rows[0]?.elements[0];
    if (!element || element.status !== 'OK') {
      console.error('❌ Route not found');
      return null;
    }
    
    return {
      distanceKm: element.distance.value / 1000,
      distanceText: element.distance.text,
      durationMin: Math.round(element.duration.value / 60),
      durationText: element.duration.text,
      originAddress: data.origin_addresses[0],
      destinationAddress: data.destination_addresses[0]
    };
    
  } catch (error) {
    console.error('❌ Google Maps request error:', error.message);
    return null;
  }
};

// ══════════════════════════════════════════════════════════════
// PRICE CALCULATION
// ══════════════════════════════════════════════════════════════

/**
 * Calculate price based on distance
 */
const calculatePriceByDistance = (distanceKm) => {
  const { BASE_PRICE, PRICE_PER_KM, FREE_KM, MIN_PRICE, VAT_RATE } = CONFIG.PRICING;
  
  // Chargeable kilometers (after free km)
  const chargeableKm = Math.max(0, distanceKm - FREE_KM);
  
  // Price before VAT: base + (extra km × price per km)
  let priceBeforeVat = BASE_PRICE + (chargeableKm * PRICE_PER_KM);
  
  // Apply minimum price
  priceBeforeVat = Math.max(priceBeforeVat, MIN_PRICE);
  
  // Calculate VAT
  const vat = priceBeforeVat * VAT_RATE;
  
  // Final price including VAT, rounded up
  const priceWithVat = Math.ceil(priceBeforeVat + vat);
  
  return {
    priceBeforeVat: Math.round(priceBeforeVat),
    vat: Math.round(vat),
    price: priceWithVat
  };
};

/**
 * Get base price (when distance cannot be calculated)
 */
const getBasePrice = () => {
  const { BASE_PRICE, VAT_RATE, MIN_PRICE } = CONFIG.PRICING;
  const priceBeforeVat = Math.max(BASE_PRICE, MIN_PRICE);
  const vat = Math.round(priceBeforeVat * VAT_RATE);
  
  return {
    priceBeforeVat,
    vat,
    price: priceBeforeVat + vat
  };
};

/**
 * Calculate full price with distance info
 */
const calculateDeliveryPrice = async (pickupAddress, deliveryAddress) => {
  const basePrice = getBasePrice();
  const commission = Math.round(basePrice.price * CONFIG.COMMISSION);
  
  // Default response if calculation fails
  const defaultResponse = {
    success: true,
    price: basePrice.price,
    priceBeforeVat: basePrice.priceBeforeVat,
    vat: basePrice.vat,
    vatRate: CONFIG.PRICING.VAT_RATE * 100,
    commission,
    payout: basePrice.price - commission,
    distance: null,
    note: 'מחיר בסיס - לא ניתן לחשב מרחק'
  };
  
  // Validate addresses
  if (!pickupAddress || !deliveryAddress) {
    return {
      success: false,
      error: 'נדרשות כתובות איסוף ומסירה',
      ...defaultResponse
    };
  }
  
  // Calculate distance
  const distance = await calculateDistance(pickupAddress, deliveryAddress);
  
  if (!distance) {
    return defaultResponse;
  }
  
  // Calculate price based on distance
  const priceData = calculatePriceByDistance(distance.distanceKm);
  const finalCommission = Math.round(priceData.price * CONFIG.COMMISSION);
  const payout = priceData.price - finalCommission;
  
  return {
    success: true,
    price: priceData.price,
    priceBeforeVat: priceData.priceBeforeVat,
    vat: priceData.vat,
    vatRate: CONFIG.PRICING.VAT_RATE * 100,
    commission: finalCommission,
    payout,
    distance: {
      km: Math.round(distance.distanceKm * 10) / 10,
      text: distance.distanceText,
      duration: distance.durationText,
      durationMin: distance.durationMin
    },
    calculation: {
      basePrice: CONFIG.PRICING.BASE_PRICE,
      pricePerKm: CONFIG.PRICING.PRICE_PER_KM,
      freeKm: CONFIG.PRICING.FREE_KM,
      chargeableKm: Math.max(0, distance.distanceKm - CONFIG.PRICING.FREE_KM).toFixed(1),
      vatRate: CONFIG.PRICING.VAT_RATE * 100 + '%'
    }
  };
};

// ══════════════════════════════════════════════════════════════
// ADDRESS SUGGESTIONS (Placeholder for Google Places)
// ══════════════════════════════════════════════════════════════

/**
 * Get address suggestions (requires Places API)
 * TODO: Implement when Places API is needed
 */
const getAddressSuggestions = async (input) => {
  // Placeholder - would use Google Places Autocomplete API
  return [];
};

module.exports = {
  calculateDistance,
  calculatePriceByDistance,
  getBasePrice,
  calculateDeliveryPrice,
  getAddressSuggestions,
};
