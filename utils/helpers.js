// Generate unique order number
function generateOrderNumber() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `MMH-${timestamp}${random}`;
}

// Format phone number
function formatPhoneNumber(phone) {
  let formatted = phone.replace(/\D/g, '');
  if (formatted.startsWith('0')) {
    formatted = '972' + formatted.substring(1);
  }
  return formatted;
}

// Calculate percentage
function calculatePercentage(value, total) {
  if (total === 0) return 0;
  return ((value / total) * 100).toFixed(2);
}

// Format currency
function formatCurrency(amount) {
  return `₪${parseFloat(amount).toFixed(2)}`;
}

// Validate ID number (Israeli)
function validateIdNumber(id) {
  id = String(id).trim();
  if (id.length !== 9 || isNaN(id)) return false;
  
  return Array.from(id, Number).reduce((counter, digit, i) => {
    const step = digit * ((i % 2) + 1);
    return counter + (step > 9 ? step - 9 : step);
  }) % 10 === 0;
}

// Sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  generateOrderNumber,
  formatPhoneNumber,
  calculatePercentage,
  formatCurrency,
  validateIdNumber,
  sleep
};