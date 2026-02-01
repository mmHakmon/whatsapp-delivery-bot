function calculatePricing(distanceKm, vehicleType = 'motorcycle') {
  const pricing = {
    motorcycle: {
      base: parseFloat(process.env.MOTORCYCLE_BASE_PRICE || 70),
      perKm: parseFloat(process.env.MOTORCYCLE_PRICE_PER_KM || 3)
    },
    car: {
      base: parseFloat(process.env.CAR_BASE_PRICE || 100),
      perKm: parseFloat(process.env.CAR_PRICE_PER_KM || 3)
    },
    van: {
      base: parseFloat(process.env.VAN_BASE_PRICE || 320),
      perKm: parseFloat(process.env.VAN_PRICE_PER_KM || 3.5)
    },
    truck: {
      base: parseFloat(process.env.TRUCK_BASE_PRICE || 900),
      perKm: parseFloat(process.env.TRUCK_PRICE_PER_KM || 4)
    }
  };

  const vehicle = pricing[vehicleType] || pricing.motorcycle;
  const freeKm = parseFloat(process.env.FREE_KM || 0);
  const vatRate = parseFloat(process.env.VAT_RATE || 0.18);
  const commissionRate = parseFloat(process.env.COMMISSION_RATE || 0.25);

  // Calculate price
  const billableKm = Math.max(0, distanceKm - freeKm);
  const priceBeforeVat = vehicle.base + (billableKm * vehicle.perKm);
  const vat = priceBeforeVat * vatRate;
  const totalPrice = Math.ceil(priceBeforeVat + vat);
  
  // ⚡ החישוב הפשוט שביקשת!
  // עמלה מהמחיר הסופי (כולל מע"מ)
  const commission = Math.floor(totalPrice * commissionRate);
  const courierPayout = totalPrice - commission;

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
    commission,
    courierPayout
  };
}

module.exports = { calculatePricing };


