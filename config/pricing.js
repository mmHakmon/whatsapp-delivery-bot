function calculatePricing(distanceKm, vehicleType = 'motorcycle') {
  const pricing = {
    motorcycle: {
      base: parseFloat(process.env.MOTORCYCLE_BASE_PRICE || 70),
      perKm: parseFloat(process.env.MOTORCYCLE_PRICE_PER_KM || 2.5)
    },
    car: {
      base: parseFloat(process.env.CAR_BASE_PRICE || 75),
      perKm: parseFloat(process.env.CAR_PRICE_PER_KM || 2.5)
    },
    van: {
      base: parseFloat(process.env.VAN_BASE_PRICE || 120),
      perKm: parseFloat(process.env.VAN_PRICE_PER_KM || 3.0)
    },
    truck: {
      base: parseFloat(process.env.TRUCK_BASE_PRICE || 200),
      perKm: parseFloat(process.env.TRUCK_PRICE_PER_KM || 4.0)
    }
  };

  const vehicle = pricing[vehicleType] || pricing.motorcycle;
  const freeKm = parseFloat(process.env.FREE_KM || 1);
  const vatRate = parseFloat(process.env.VAT_RATE || 0.18);
  const commissionRate = parseFloat(process.env.COMMISSION_RATE || 0.25);

  // Calculate price
  const billableKm = Math.max(0, distanceKm - freeKm);
  const priceBeforeVat = vehicle.base + (billableKm * vehicle.perKm);
  const vat = priceBeforeVat * vatRate;
  const totalPrice = Math.ceil(priceBeforeVat + vat);
  
  const commission = priceBeforeVat * commissionRate;
  const courierPayout = Math.floor(priceBeforeVat - commission);

  return {
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    vehicleType,
    basePrice: vehicle.base,
    pricePerKm: vehicle.perKm,
    billableKm: parseFloat(billableKm.toFixed(2)),
    priceBeforeVat: parseFloat(priceBeforeVat.toFixed(2)),
    vat: parseFloat(vat.toFixed(2)),
    totalPrice,
    commissionRate: commissionRate * 100,
    commission: parseFloat(commission.toFixed(2)),
    courierPayout
  };
}

module.exports = { calculatePricing };