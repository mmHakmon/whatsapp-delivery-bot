// Validation middleware for requests
const validatePayoutRequest = (req, res, next) => {
  const { amount, paymentMethod } = req.body;
  
  // Validate amount
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'סכום לא תקין' });
  }
  
  // Check minimum amount
  const minPayout = parseFloat(process.env.MIN_PAYOUT_AMOUNT || 50);
  if (amount < minPayout) {
    return res.status(400).json({ error: `סכום מינימלי למשיכה: ₪${minPayout}` });
  }
  
  // Validate payment method (optional)
  if (paymentMethod) {
    const validMethods = ['bank_transfer', 'bit', 'cash'];
    if (!validMethods.includes(paymentMethod)) {
      return res.status(400).json({ error: 'אמצעי תשלום לא תקין' });
    }
  }
  
  next();
};

const validateOrderCreation = (req, res, next) => {
  const { 
    senderPhone, 
    receiverPhone, 
    pickupAddress, 
    deliveryAddress,
    vehicleType 
  } = req.body;

  console.log('🔍 Validating order creation:', {
    senderPhone,
    receiverPhone,
    pickupAddress,
    deliveryAddress,
    vehicleType,
    allFields: req.body
  });

  // Validate required fields
  if (!senderPhone || !receiverPhone || !pickupAddress || !deliveryAddress || !vehicleType) {
    console.error('❌ Missing required fields');
    return res.status(400).json({ 
      error: 'חסרים פרטים נדרשים',
      details: {
        senderPhone: !!senderPhone,
        receiverPhone: !!receiverPhone,
        pickupAddress: !!pickupAddress,
        deliveryAddress: !!deliveryAddress,
        vehicleType: !!vehicleType
      }
    });
  }

  // Validate phone numbers (10 digits)
  const phoneRegex = /^0\d{9}$/;
  if (!phoneRegex.test(senderPhone)) {
    console.error('❌ Invalid sender phone:', senderPhone);
    return res.status(400).json({ error: 'מספר טלפון שולח לא תקין' });
  }
  if (!phoneRegex.test(receiverPhone)) {
    console.error('❌ Invalid receiver phone:', receiverPhone);
    return res.status(400).json({ error: 'מספר טלפון מקבל לא תקין' });
  }

  // ✅ FIXED: Validate vehicle type - NOW INCLUDES MOTORCYCLE
  const validVehicles = ['motorcycle', 'bike', 'scooter', 'car', 'van', 'truck'];
  if (!validVehicles.includes(vehicleType)) {
    console.error('❌ Invalid vehicle type:', vehicleType);
    return res.status(400).json({ 
      error: 'סוג רכב לא תקין',
      details: {
        received: vehicleType,
        validOptions: validVehicles
      }
    });
  }

  console.log('✅ Validation passed');
  next();
};

const validateCourierRegistration = (req, res, next) => {
  const { 
    firstName, 
    lastName, 
    phone, 
    idNumber, 
    vehicleType 
  } = req.body;
  
  // Validate required fields
  if (!firstName || !lastName || !phone || !idNumber || !vehicleType) {
    return res.status(400).json({ error: 'חסרים פרטים נדרשים' });
  }
  
  // Validate phone (10 digits)
  const phoneRegex = /^0\d{9}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: 'מספר טלפון לא תקין' });
  }
  
  // Validate ID number (9 digits)
  const idRegex = /^\d{9}$/;
  if (!idRegex.test(idNumber)) {
    return res.status(400).json({ error: 'תעודת זהות לא תקינה' });
  }
  
  // ✅ FIXED: Validate vehicle type - NOW INCLUDES MOTORCYCLE
  const validVehicles = ['motorcycle', 'bike', 'scooter', 'car', 'van', 'truck'];
  if (!validVehicles.includes(vehicleType)) {
    return res.status(400).json({ error: 'סוג רכב לא תקין' });
  }
  
  next();
};

const validateCustomerRegistration = (req, res, next) => {
  const { name, phone, password } = req.body;
  
  // Validate required fields
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'חסרים פרטים נדרשים' });
  }
  
  // Validate phone (10 digits)
  const phoneRegex = /^0\d{9}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({ error: 'מספר טלפון לא תקין' });
  }
  
  // Validate password length
  if (password.length < 6) {
    return res.status(400).json({ error: 'סיסמה חייבת להכיל לפחות 6 תווים' });
  }
  
  next();
};

module.exports = {
  validatePayoutRequest,
  validateOrderCreation,
  validateCourierRegistration,
  validateCustomerRegistration
};
