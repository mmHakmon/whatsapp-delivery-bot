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
    const validMethods = ['bank_transfer', 'paypal', 'cash', 'other'];
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

  // Validate required fields
  if (!senderPhone || !receiverPhone || !pickupAddress || !deliveryAddress || !vehicleType) {
    return res.status(400).json({ error: 'חסרים פרטים נדרשים' });
  }

  // Validate phone numbers (10 digits)
  const phoneRegex = /^0\d{9}$/;
  if (!phoneRegex.test(senderPhone)) {
    return res.status(400).json({ error: 'מספר טלפון שולח לא תקין' });
  }
  if (!phoneRegex.test(receiverPhone)) {
    return res.status(400).json({ error: 'מספר טלפון מקבל לא תקין' });
  }

  // Validate vehicle type
  const validVehicles = ['bike', 'scooter', 'car', 'van', 'truck'];
  if (!validVehicles.includes(vehicleType)) {
    return res.status(400).json({ error: 'סוג רכב לא תקין' });
  }

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

  // Validate vehicle type
  const validVehicles = ['bike', 'scooter', 'car', 'van', 'truck'];
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
