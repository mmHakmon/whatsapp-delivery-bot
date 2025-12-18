// ==========================================
// M.M.H DELIVERY - COURIER APP
// ==========================================

let courierToken = localStorage.getItem('courierToken');
let courierData = null;
let ws = null;
let locationInterval = null;

// ==========================================
// AUTHENTICATION
// ==========================================

function showPhoneLogin() {
    document.getElementById('phoneLoginForm').classList.remove('hidden');
    document.getElementById('idLoginForm').classList.add('hidden');
    document.getElementById('btnPhoneLogin').className = 'flex-1 bg-purple-600 py-2 rounded-lg font-bold';
    document.getElementById('btnIdLogin').className = 'flex-1 bg-slate-700 py-2 rounded-lg';
}

function showIdLogin() {
    document.getElementById('phoneLoginForm').classList.add('hidden');
    document.getElementById('idLoginForm').classList.remove('hidden');
    document.getElementById('btnIdLogin').className = 'flex-1 bg-purple-600 py-2 rounded-lg font-bold';
    document.getElementById('btnPhoneLogin').className = 'flex-1 bg-slate-700 py-2 rounded-lg';
}

async function courierLogin(event) {
    event.preventDefault();
    
    const phone = document.getElementById('loginPhone').value;
    
    try {
        const response = await fetch('/api/auth/courier-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            courierToken = data.token;
            courierData = data.courier;
            localStorage.setItem('courierToken', courierToken);
            localStorage.setItem('courierData', JSON.stringify(courierData));
            
            showMainApp();
        } else if (data.needsRegistration) {
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('registerForm').classList.remove('hidden');
            document.getElementById('regPhone').value = phone;
        } else {
            showLoginError(data.error || 'שגיאה בהתחברות');
        }
    } catch (error) {
        showLoginError('שגיאת תקשורת');
        console.error('Login error:', error);
    }
}

async function courierLoginById(event) {
    event.preventDefault();
    
    const idNumber = document.getElementById('loginId').value;
    
    try {
        const response = await fetch('/api/auth/courier-login-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idNumber })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            courierToken = data.token;
            courierData = data.courier;
            localStorage.setItem('courierToken', courierToken);
            localStorage.setItem('courierData', JSON.stringify(courierData));
            
            showMainApp();
        } else if (data.needsRegistration) {
            window.location.href = '/courier/register.html';
        } else {
            showLoginError(data.error || 'שגיאה בהתחברות');
        }
    } catch (error) {
        showLoginError('שגיאת תקשורת');
        console.error('Login error:', error);
    }
}

function showLoginError(message) {
    alert(message);
}

function showLoginForm() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

async function registerCourier(event) {
    event.preventDefault();
    
    const formData = {
        firstName: document.getElementById('regFirstName').value,
        lastName: document.getElementById('regLastName').value,
        idNumber: document.getElementById('regIdNumber').value,
        phone: document.getElementById('regPhone').value,
        vehicleType: document.getElementById('regVehicleType').value
    };
    
    try {
        const response = await fetch('/api/couriers/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            alert('✅ הרישום בוצע בהצלחה! המנהל יאשר את חשבונך בקרוב.');
            showLoginForm();
        } else {
            const data = await response.json();
            alert('❌ ' + (data.error || 'שגיאה ברישום'));
        }
    } catch (error) {
        console.error('Register error:', error);
        alert('❌ שגיאת תקשורת');
    }
}

function checkAuth() {
    courierToken = localStorage.getItem('courierToken');
    const savedData = localStorage.getItem('courierData');
    
    if (courierToken && savedData) {
        courierData = JSON.parse(savedData);
        showMainApp();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('mainApp').classList.add('hidden');
    }
}

function showMainApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    document.getElementById('courierName').textContent = `${courierData.firstName} ${courierData.lastName}`;
    document.getElementById('courierPhone').textContent = courierData.phone;
    
    initCourierApp();
}

// ==========================================
// INITIALIZATION
// ==========================================

function initCourierApp() {
    connectWebSocket();
    startLocationTracking();
    loadCourierStatistics();
    loadAvailableOrders();
    loadMyOrders();
}

// ==========================================
// WEBSOCKET
// ==========================================

function connectWebSocket() {
    const wsUrl = window.location.protocol === 'https:' 
        ? `wss://${window.location.host}` 
        : `ws://${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        ws.send(JSON.stringify({
            type: 'auth',
            userId: courierData.id,
            userType: 'courier'
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        setTimeout(connectWebSocket, 3000);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'new_available_order':
            showNotification('📦 משלוח חדש זמין!');
            loadAvailableOrders();
            break;
        case 'order_updated':
            loadAvailableOrders();
            loadMyOrders();
            break;
    }
}

// ==========================================
// LOCATION TRACKING
// ==========================================

function startLocationTracking() {
    if ('geolocation' in navigator) {
        // Get location every 10 seconds
        locationInterval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    sendLocation(position.coords);
                },
                (error) => {
                    console.error('Location error:', error);
                }
            );
        }, 10000);
        
        // Get initial location
        navigator.geolocation.getCurrentPosition(
            (position) => {
                sendLocation(position.coords);
            }
        );
    }
}

async function sendLocation(coords) {
    try {
        await fetch('/api/couriers/location', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${courierToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                latitude: coords.latitude,
                longitude: coords.longitude,
                accuracy: coords.accuracy,
                heading: coords.heading,
                speed: coords.speed
            })
        });
    } catch (error) {
        console.error('Location send error:', error);
    }
}

// ==========================================
// STATISTICS
// ==========================================

async function loadCourierStatistics() {
    try {
        const response = await fetch('/api/couriers/my-statistics', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const stats = data.statistics;
            
            document.getElementById('statToday').textContent = stats.today_deliveries || 0;
            document.getElementById('statWeek').textContent = stats.week_deliveries || 0;
            document.getElementById('statMonth').textContent = stats.month_deliveries || 0;
            document.getElementById('courierBalance').textContent = `₪${parseFloat(data.balance || 0).toLocaleString()}`;
            document.getElementById('earningsBalance').textContent = `₪${parseFloat(data.balance || 0).toLocaleString()}`;
        }
    } catch (error) {
        console.error('Statistics error:', error);
    }
}

// ==========================================
// AVAILABLE ORDERS
// ==========================================

async function loadAvailableOrders() {
    try {
        const response = await fetch('/api/couriers/available-orders', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayAvailableOrders(data.orders);
        }
    } catch (error) {
        console.error('Load available orders error:', error);
    }
}

function displayAvailableOrders(orders) {
    const container = document.getElementById('availableOrdersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">📭</div>
                <p class="text-lg font-bold mb-2">אין משלוחים זמינים כרגע</p>
                <p class="text-sm">כשיהיה משלוח חדש, תקבל התראה</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <p class="text-lg font-bold text-emerald-400">💰 ₪${order.courier_payout}</p>
                    <p class="text-xs text-slate-400">${order.distance_km} ק"מ</p>
                </div>
                <div class="text-left">
                    <p class="text-sm font-bold">${order.order_number}</p>
                    <p class="text-xs text-slate-400">${getVehicleEmoji(order.vehicle_type)} ${getVehicleNameHebrew(order.vehicle_type)}</p>
                </div>
            </div>
            
            <div class="space-y-2 text-sm mb-3">
                <div class="flex items-start gap-2">
                    <span>📍</span>
                    <p class="text-slate-300">${order.pickup_address}</p>
                </div>
                <div class="flex items-start gap-2">
                    <span>🏠</span>
                    <p class="text-slate-300">${order.delivery_address}</p>
                </div>
            </div>
            
            <button onclick="takeOrder(${order.id})" class="w-full bg-emerald-500 hover:bg-emerald-600 font-bold py-3 rounded-lg">
                ✋ תפוס משלוח
            </button>
        </div>
    `).join('');
}

async function takeOrder(orderId) {
    if (!confirm('האם לתפוס את המשלוח הזה?')) return;
    
    try {
        const response = await fetch(`/api/orders/${orderId}/take`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            showNotification('✅ המשלוח נתפס! פרטי איסוף נשלחו בוואטסאפ');
            loadAvailableOrders();
            loadMyOrders();
            switchCourierTab('active'); // Switch to active tab
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Take order error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

// ==========================================
// MY ORDERS (ACTIVE) - תיקון!
// ==========================================

async function loadMyOrders() {
    try {
        // Load all my orders, then filter
        const response = await fetch('/api/couriers/my-orders', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            // Filter only taken and picked orders
            const activeOrders = data.orders.filter(o => o.status === 'taken' || o.status === 'picked');
            displayMyOrders(activeOrders);
        }
    } catch (error) {
        console.error('Load my orders error:', error);
    }
}

function displayMyOrders(orders) {
    const container = document.getElementById('activeOrdersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">✅</div>
                <p class="text-lg font-bold mb-2">אין משלוחים פעילים</p>
                <p class="text-sm">לך לזמינים ותפוס משלוח!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <p class="text-lg font-bold">${order.order_number}</p>
                    ${order.status === 'taken' 
                        ? '<span class="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/50">נתפס - בדרך לאיסוף</span>'
                        : '<span class="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400 border border-purple-500/50">נאסף - בדרך למסירה</span>'
                    }
                </div>
                <p class="text-xl font-bold text-emerald-400">₪${order.courier_payout}</p>
            </div>
            
            ${order.status === 'taken' ? `
                <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-3">
                    <p class="text-sm font-bold mb-2">📤 איסוף:</p>
                    <p class="text-sm mb-1">${order.sender_name} • ${order.sender_phone}</p>
                    <p class="text-sm text-slate-300">${order.pickup_address}</p>
                    ${order.pickup_notes ? `<p class="text-xs text-slate-400 mt-1">📝 ${order.pickup_notes}</p>` : ''}
                </div>
            ` : `
                <div class="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 mb-3">
                    <p class="text-sm font-bold mb-2">📥 מסירה:</p>
                    <p class="text-sm mb-1">${order.receiver_name} • ${order.receiver_phone}</p>
                    <p class="text-sm text-slate-300">${order.delivery_address}</p>
                    ${order.delivery_notes ? `<p class="text-xs text-slate-400 mt-1">📝 ${order.delivery_notes}</p>` : ''}
                </div>
            `}
            
            <div class="flex gap-2">
                ${order.status === 'taken' ? `
                    <button onclick="openWaze('${order.pickup_address}')" class="flex-1 bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm">
                        🗺️ נווט
                    </button>
                    <button onclick="markAsPickedUp(${order.id})" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg text-sm font-bold">
                        📦 אספתי
                    </button>
                ` : `
                    <button onclick="openWaze('${order.delivery_address}')" class="flex-1 bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm">
                        🗺️ נווט
                    </button>
                    <button onclick="markAsDelivered(${order.id})" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg text-sm font-bold">
                        ✅ מסרתי
                    </button>
                `}
            </div>
        </div>
    `).join('');
}

async function markAsPickedUp(orderId) {
    if (!confirm('האם אספת את החבילה?')) return;
    
    try {
        const response = await fetch(`/api/orders/${orderId}/pickup`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            showNotification('✅ החבילה נאספה! עכשיו לך למסירה');
            loadMyOrders();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Pickup error:', error);
    }
}

async function markAsDelivered(orderId) {
    if (!confirm('האם מסרת את החבילה ללקוח?')) return;
    
    try {
        const response = await fetch(`/api/orders/${orderId}/deliver`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification(`🎉 כל הכבוד! הרווחת ₪${data.earned}`);
            loadMyOrders();
            loadCourierStatistics();
            loadOrderHistory();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Deliver error:', error);
    }
}

function openWaze(address) {
    const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(address)}`;
    window.open(wazeUrl, '_blank');
}

// ==========================================
// ORDER HISTORY
// ==========================================

async function loadOrderHistory() {
    try {
        const response = await fetch('/api/couriers/my-orders', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const deliveredOrders = data.orders.filter(o => o.status === 'delivered');
            displayOrderHistory(deliveredOrders);
        }
    } catch (error) {
        console.error('Load history error:', error);
    }
}

function displayOrderHistory(orders) {
    const container = document.getElementById('historyOrdersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">📋</div>
                <p>אין היסטוריה עדיין</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
            <div class="flex justify-between items-center mb-2">
                <p class="font-bold">${order.order_number}</p>
                <p class="text-emerald-400 font-bold">+₪${order.courier_payout}</p>
            </div>
            <p class="text-xs text-slate-400">${new Date(order.delivered_at).toLocaleDateString('he-IL')}</p>
            <p class="text-xs text-slate-400">${order.distance_km} ק"מ</p>
        </div>
    `).join('');
}

// ==========================================
// EARNINGS
// ==========================================

async function loadPayoutRequests() {
    try {
        const response = await fetch('/api/payments/my-requests', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayPayoutRequests(data.requests);
        }
    } catch (error) {
        console.error('Load payout requests error:', error);
    }
}

function displayPayoutRequests(requests) {
    const container = document.getElementById('payoutRequestsList');
    
    if (!requests || requests.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <p>אין בקשות משיכה</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = requests.map(req => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div class="flex justify-between items-center mb-2">
                <p class="font-bold">₪${parseFloat(req.amount).toLocaleString()}</p>
                ${getPaymentStatusBadge(req.status)}
            </div>
            <p class="text-xs text-slate-400">${new Date(req.created_at).toLocaleDateString('he-IL')}</p>
        </div>
    `).join('');
}

function getPaymentStatusBadge(status) {
    const badges = {
        'pending': '<span class="px-2 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400">ממתין</span>',
        'approved': '<span class="px-2 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400">אושר</span>',
        'completed': '<span class="px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">הושלם</span>',
        'rejected': '<span class="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-400">נדחה</span>'
    };
    return badges[status] || '';
}

async function requestPayout() {
    const amount = prompt('כמה כסף לבקש למשיכה?');
    if (!amount) return;
    
    const paymentMethod = prompt('אמצעי תשלום (bank_transfer / bit / cash):', 'bank_transfer');
    if (!paymentMethod) return;
    
    try {
        const response = await fetch('/api/payments/payout-request', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${courierToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: parseFloat(amount),
                paymentMethod,
                accountInfo: { note: 'Manual request' }
            })
        });
        
        if (response.ok) {
            showNotification('✅ בקשת משיכה נשלחה!');
            loadPayoutRequests();
            loadCourierStatistics();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Payout request error:', error);
    }
}

// ==========================================
// TABS
// ==========================================

function switchCourierTab(tab) {
    // Update tabs
    document.querySelectorAll('[id^="tab"]').forEach(t => t.className = 'courier-tab-inactive px-4 py-2 text-sm');
    document.querySelectorAll('.courier-tab-content').forEach(t => t.classList.add('hidden'));
    
    const tabMap = {
        'available': 'tabAvailable',
        'active': 'tabActive',
        'history': 'tabHistory',
        'earnings': 'tabEarnings'
    };
    
    document.getElementById(tabMap[tab]).className = 'courier-tab-active px-4 py-2 text-sm font-bold';
    document.getElementById(`${tab}Tab`).classList.remove('hidden');
    
    // Load data
    if (tab === 'available') loadAvailableOrders();
    if (tab === 'active') loadMyOrders();
    if (tab === 'history') loadOrderHistory();
    if (tab === 'earnings') loadPayoutRequests();
}

// ==========================================
// HELPERS
// ==========================================

function getVehicleEmoji(type) {
    const emojis = {
        'motorcycle': '🏍️',
        'car': '🚗',
        'van': '🚐',
        'truck': '🚚'
    };
    return emojis[type] || '🚗';
}

function getVehicleNameHebrew(type) {
    const names = {
        'motorcycle': 'אופנוע',
        'car': 'רכב פרטי',
        'van': 'מסחרית',
        'truck': 'משאית'
    };
    return names[type] || 'רכב';
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 ${
        type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
    } text-white font-bold`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});
