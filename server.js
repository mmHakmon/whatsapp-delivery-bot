// ==========================================
// ADD THIS TO server.js AFTER THE google-maps-key ENDPOINT
// ==========================================

// PRICE CALCULATION ENDPOINT
app.post('/api/calculate-price', (req, res) => {
  const { pickupLat, pickupLng, deliveryLat, deliveryLng, vehicleType } = req.body;
  
  try {
    // Validate inputs
    if (!pickupLat || !pickupLng || !deliveryLat || !deliveryLng || !vehicleType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Calculate distance using Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = (deliveryLat - pickupLat) * Math.PI / 180;
    const dLon = (deliveryLng - pickupLng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pickupLat * Math.PI / 180) * Math.cos(deliveryLat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    // Price per km by vehicle type
    const pricePerKm = {
      motorcycle: 2.5,  // אופנוע - ₪3.5 לק"מ
      bike: 2.5,        // אופניים - ₪2.5 לק"מ
      scooter: 2.5,     // קטנוע - ₪2.5 לק"מ
      car: 2.7,         // רכב פרטי - ₪2.7 לק"מ
      van: 3,         // מסחרית - ₪3.0 לק"מ
      truck: 4        // משאית - ₪4.0 לק"מ
    };
    
    const rate = pricePerKm[vehicleType] || 3.5;
    const basePrice = Math.ceil(distance * rate);
    const vat = Math.ceil(basePrice * 0.18);
    const totalPrice = basePrice + vat;
    
    console.log('💰 Price calculated:', {
      distance: distance.toFixed(1) + ' km',
      vehicle: vehicleType,
      rate: `₪${rate}/km`,
      basePrice: `₪${basePrice}`,
      vat: `₪${vat}`,
      total: `₪${totalPrice}`
    });
    
    res.json({
      distanceKm: parseFloat(distance.toFixed(1)),
      basePrice,
      vat,
      totalPrice
    });
    
  } catch (error) {
    console.error('❌ Price calculation error:', error);
    res.status(500).json({ error: 'שגיאה בחישוב מחיר' });
  }
});

// server.js
app.post('/api/calculate-price', authenticateToken, async (req, res) => {
    const { pickupLat, pickupLng, deliveryLat, deliveryLng, vehicleType } = req.body;
    
    try {
        // חישוב מרחק
        const distance = calculateDistance(pickupLat, pickupLng, deliveryLat, deliveryLng);
        
        // מחיר לפי רכב
        const prices = {
            motorcycle: 2.5,
            bike: 2.5,
            scooter: 2.5,
            car: 2.7,
            van: 3,
            truck: 4
        };
        
        const pricePerKm = prices[vehicleType] || 2.5;
        const basePrice = Math.ceil(distance * pricePerKm);
        const vat = Math.ceil(basePrice * 0.18);
        const totalPrice = basePrice + vat;
        
        res.json({
            distanceKm: distance.toFixed(1),
            basePrice,
            vat,
            totalPrice
        });
    } catch (error) {
        res.status(500).json({ error: 'שגיאה בחישוב מחיר' });
    }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // רדיוס כדור הארץ בק"מ
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// 👆 ADD THE PRICE CALCULATION ENDPOINT HERE 👇

*/
