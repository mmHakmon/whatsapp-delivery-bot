// CURresponse Order System - JavaScript
const API_URL = window.location.origin;
let selectedOrderType = null;
let selectedHospital = null;

// Israeli Hospitals Database
const HOSPITALS = [
  // Center - Tel Aviv
  { id: 'shiba', name: 'שיבא - תל השומר', city: 'רמת גן', address: 'דרך שבע 2, תל השומר, רמת גן', region: 'center' },
  { id: 'ichilov', name: 'איכילוב', city: 'תל אביב', address: 'ויצמן 6, תל אביב', region: 'center' },
  { id: 'wolfson', name: 'וולפסון', city: 'חולון', address: 'הלוחמים 62, חולון', region: 'center' },
  { id: 'assaf', name: 'אסף הרופא', city: 'צריפין', address: 'אסף הרופא, צריפין', region: 'center' },
  
  // Sharon
  { id: 'beilinson', name: 'בילינסון - רבין', city: 'פתח תקווה', address: 'ז\'בוטינסקי 39, פתח תקווה', region: 'sharon' },
  { id: 'meir', name: 'מאיר', city: 'כפר סבא', address: 'תש"ח 59, כפר סבא', region: 'sharon' },
  { id: 'hasharon', name: 'השרון', city: 'פתח תקווה', address: 'קופת חולים 7, פתח תקווה', region: 'sharon' },
  { id: 'laniado', name: 'לניאדו', city: 'נתניה', address: 'רחוב הרצל 16, נתניה', region: 'sharon' },
  
  // Center South
  { id: 'kaplan', name: 'קפלן', city: 'רחובות', address: 'דרך פסטר 1, רחובות', region: 'center-south' },
  { id: 'ashdod', name: 'אסותא אשדוד', city: 'אשדוד', address: 'הרוקמים 7, אשדוד', region: 'center-south' },
  
  // Jerusalem
  { id: 'hadassah-ein', name: 'הדסה עין כרם', city: 'ירושלים', address: 'קריית הדסה, עין כרם, ירושלים', region: 'jerusalem' },
  { id: 'hadassah-har', name: 'הדסה הר הצופים', city: 'ירושלים', address: 'הר הצופים, ירושלים', region: 'jerusalem' },
  { id: 'shaare-zedek', name: 'שערי צדק', city: 'ירושלים', address: 'שמואל הנגיד 12, ירושלים', region: 'jerusalem' },
  
  // North
  { id: 'rambam', name: 'רמב"ם', city: 'חיפה', address: 'אפרון 8, חיפה', region: 'north' },
  { id: 'bnai-zion', name: 'בני ציון', city: 'חיפה', address: 'אלחדיף 47, חיפה', region: 'north' },
  { id: 'carmel', name: 'כרמל', city: 'חיפה', address: 'מיכל 7, חיפה', region: 'north' },
  { id: 'nahariya', name: 'נהריה', city: 'נהריה', address: 'לחי 1, נהריה', region: 'north' },
  { id: 'ziv', name: 'זיו', city: 'צפת', address: 'רחי"ל 36, צפת', region: 'north' },
  { id: 'emek', name: 'העמק', city: 'עפולה', address: 'יצחק רבין, עפולה', region: 'north' },
  { id: 'poriya', name: 'פוריה', city: 'טבריה', address: 'פוריה עילית, טבריה', region: 'north' },
  
  // South
  { id: 'soroka', name: 'סורוקה', city: 'באר שבע', address: 'יצחק רגר, באר שבע', region: 'south' },
  { id: 'barzilai', name: 'ברזילי', city: 'אשקלון', address: 'החיל 2, אשקלון', region: 'south' },
  { id: 'yoseftal', name: 'יוספטל', city: 'אילת', address: 'יוטבתה, אילת', region: 'south' }
];

// ==========================================
// INITIALIZATION
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadCustomerInfo();
  renderHospitals();
  setMinDateTime();
});

// Check authentication
function checkAuth() {
  const token = localStorage.getItem('curresponseToken');
  if (!token) {
    window.location.href = '/customer/curresponse/login.html';
    return;
  }
}

// Load customer info
async function loadCustomerInfo() {
  const customer = JSON.parse(localStorage.getItem('curresponseCustomer'));
  if (customer) {
    document.getElementById('userName').textContent = customer.name;
    document.getElementById('companyName').textContent = customer.businessName || customer.company_name;
  }
}

// Set minimum datetime (4 hours from now)
function setMinDateTime() {
  const now = new Date();
  now.setHours(now.getHours() + 4);
  const minDateTime = now.toISOString().slice(0, 16);
  document.getElementById('scheduledTime').min = minDateTime;
}

// ==========================================
// ORDER TYPE SELECTION
// ==========================================
function selectOrderType(type) {
  selectedOrderType = type;
  
  // Update buttons
  document.querySelectorAll('.order-type-btn').forEach(btn => {
    btn.classList.remove('border-white', 'scale-105');
    btn.classList.add('border-transparent');
  });
  
  const selectedBtn = type === 'immediate' ? document.getElementById('btnImmediate') : document.getElementById('btnPlanned');
  selectedBtn.classList.add('border-white', 'scale-105');
  selectedBtn.classList.remove('border-transparent');
  
  // Show/hide scheduled time
  if (type === 'planned') {
    document.getElementById('scheduledTimeSection').classList.remove('hidden');
    document.getElementById('scheduledTime').required = true;
  } else {
    document.getElementById('scheduledTimeSection').classList.add('hidden');
    document.getElementById('scheduledTime').required = false;
  }
  
  updateSubmitButton();
  updateSummary();
}

// ==========================================
// HOSPITALS
// ==========================================
function renderHospitals() {
  const container = document.getElementById('hospitalsList');
  container.innerHTML = '';
  
  HOSPITALS.forEach(hospital => {
    const div = document.createElement('div');
    div.className = 'hospital-item bg-slate-700 hover:bg-blue-600 border-2 border-slate-600 hover:border-blue-400 rounded-lg p-4 cursor-pointer transition';
    div.onclick = () => selectHospital(hospital);
    
    div.innerHTML = `
      <div class="flex items-start gap-3">
        <span class="text-2xl">🏥</span>
        <div class="flex-1">
          <h4 class="font-bold text-lg">${hospital.name}</h4>
          <p class="text-sm text-slate-300">${hospital.city}</p>
          <p class="text-xs text-slate-400 mt-1">${hospital.address}</p>
        </div>
      </div>
    `;
    
    container.appendChild(div);
  });
}

function selectHospital(hospital) {
  selectedHospital = hospital;
  
  // Update visual selection
  document.querySelectorAll('.hospital-item').forEach(item => {
    item.classList.remove('bg-blue-600', 'border-blue-400', 'scale-105');
    item.classList.add('bg-slate-700', 'border-slate-600');
  });
  
  event.target.closest('.hospital-item').classList.add('bg-blue-600', 'border-blue-400', 'scale-105');
  event.target.closest('.hospital-item').classList.remove('bg-slate-700', 'border-slate-600');
  
  updateSubmitButton();
  updateSummary();
}

function filterHospitals() {
  const search = document.getElementById('hospitalSearch').value.toLowerCase();
  const items = document.querySelectorAll('.hospital-item');
  
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(search) ? 'block' : 'none';
  });
}

// ==========================================
// FORM HANDLING
// ==========================================
function updateSubmitButton() {
  const btn = document.getElementById('submitBtn');
  
  if (selectedOrderType && selectedHospital) {
    btn.disabled = false;
    btn.textContent = selectedOrderType === 'immediate' ? '🚀 הזמן משלוח מיידי' : '📅 קבע הזמנה מתוכננת';
  } else {
    btn.disabled = true;
    btn.textContent = '⏳ בחר סוג הזמנה ובית חולים';
  }
}

function updateSummary() {
  if (!selectedOrderType || !selectedHospital) {
    document.getElementById('orderSummary').classList.add('hidden');
    return;
  }
  
  document.getElementById('orderSummary').classList.remove('hidden');
  document.getElementById('summaryType').textContent = selectedOrderType === 'immediate' ? '⚡ מיידי' : '📅 מתוכנן';
  document.getElementById('summaryHospital').textContent = selectedHospital.name;
  
  if (selectedOrderType === 'planned') {
    const time = document.getElementById('scheduledTime').value;
    if (time) {
      document.getElementById('summaryTimeRow').classList.remove('hidden');
      document.getElementById('summaryTime').textContent = new Date(time).toLocaleString('he-IL');
    }
  } else {
    document.getElementById('summaryTimeRow').classList.add('hidden');
  }
}

// Update summary on time change
document.getElementById('scheduledTime')?.addEventListener('change', updateSummary);

// ==========================================
// CREATE ORDER
// ==========================================
async function createOrder(event) {
  event.preventDefault();
  
  if (!selectedOrderType || !selectedHospital) {
    alert('אנא בחר סוג הזמנה ובית חולים');
    return;
  }
  
  // Validate scheduled time for planned orders
  if (selectedOrderType === 'planned') {
    const scheduledTime = document.getElementById('scheduledTime').value;
    if (!scheduledTime) {
      alert('אנא בחר תאריך ושעה');
      return;
    }
    
    const selectedDate = new Date(scheduledTime);
    const minDate = new Date();
    minDate.setHours(minDate.getHours() + 4);
    
    if (selectedDate < minDate) {
      alert('יש לבחור שעה לפחות 4 שעות מראש');
      return;
    }
  }
  
  // Show loading
  document.getElementById('loadingModal').classList.remove('hidden');
  
  try {
    const token = localStorage.getItem('curresponseToken');
    
    const orderData = {
      orderType: selectedOrderType,
      hospitalId: selectedHospital.id,
      hospitalAddress: selectedHospital.address,
      scheduledPickupTime: selectedOrderType === 'planned' ? document.getElementById('scheduledTime').value : null,
      packageDescription: document.getElementById('packageDescription').value,
      notes: document.getElementById('notes').value
    };
    
    const response = await fetch(`${API_URL}/api/curresponse/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(orderData)
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Hide loading
      document.getElementById('loadingModal').classList.add('hidden');
      
      // Show success
      document.getElementById('orderNumber').textContent = data.order.orderNumber;
      document.getElementById('successMessage').textContent = data.message;
      document.getElementById('successModal').classList.remove('hidden');
    } else {
      throw new Error(data.error || 'שגיאה ביצירת הזמנה');
    }
  } catch (error) {
    console.error('Create order error:', error);
    document.getElementById('loadingModal').classList.add('hidden');
    alert('שגיאה: ' + error.message);
  }
}

// ==========================================
// NAVIGATION
// ==========================================
function showHistory() {
  window.location.href = '/customer/curresponse/history.html';
}

function logout() {
  if (confirm('האם אתה בטוח שברצונך להתנתק?')) {
    localStorage.removeItem('curresponseToken');
    localStorage.removeItem('curresponseCustomer');
    window.location.href = '/customer/curresponse/login.html';
  }
}
