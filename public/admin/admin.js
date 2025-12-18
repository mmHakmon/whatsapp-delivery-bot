// ==========================================
// M.M.H DELIVERY - ADMIN DASHBOARD
// ==========================================

let adminToken = localStorage.getItem('adminToken');
let userData = null;
let ws = null;
let currentFilter = 'all';

// ==========================================
// AUTHENTICATION
// ==========================================

async function login(event) {
    event.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            adminToken = data.accessToken;
            userData = data.user;
            localStorage.setItem('adminToken', adminToken);
            localStorage.setItem('userData', JSON.stringify(userData));
            
            showDashboard();
        } else {
            showLoginError(data.error || 'שגיאה בהתחברות');
        }
    } catch (error) {
        showLoginError('שגיאת תקשורת');
        console.error('Login error:', error);
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 3000);
}

function logout() {
    if (confirm('האם אתה בטוח שברצונך להתנתק?')) {
        localStorage.clear();
        location.reload();
    }
}

function checkAuth() {
    adminToken = localStorage.getItem('adminToken');
    const savedData = localStorage.getItem('userData');
    
    if (adminToken && savedData) {
        userData = JSON.parse(savedData);
        showDashboard();
    } else {
        document.getElementById('loginModal').classList.remove('hidden');
        document.getElementById('mainContent').classList.add('hidden');
    }
}

function showDashboard() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    
    document.getElementById('userName').textContent = userData.name;
    document.getElementById('userRole').textContent = getRoleNameHebrew(userData.role);
    
    initDashboard();
}

function getRoleNameHebrew(role) {
    const roles = {
        'admin': 'מנהל',
        'manager': 'מנהל',
        'agent': 'נציג'
    };
    return roles[role] || 'משתמש';
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
            userId: userData.id,
            role: userData.role,
            userType: 'admin'
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
        case 'new_order':
            showNotification('📦 הזמנה חדשה התקבלה!');
            loadOrders();
            loadStatistics();
            break;
        case 'order_updated':
            loadOrders();
            break;
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

async function initDashboard() {
    connectWebSocket();
    loadStatistics();
    loadOrders();
}

// ==========================================
// STATISTICS
// ==========================================

async function loadStatistics() {
    try {
        const response = await fetch('/api/admin/dashboard-stats', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const stats = data.statistics;
            
            document.getElementById('statTotalOrders').textContent = stats.total_orders || 0;
            document.getElementById('statActiveOrders').textContent = stats.active_orders || 0;
            document.getElementById('statDelivered').textContent = stats.delivered_orders || 0;
            document.getElementById('statRevenue').textContent = `₪${parseFloat(stats.total_revenue || 0).toLocaleString()}`;
        }
    } catch (error) {
        console.error('Statistics error:', error);
    }
}

// ==========================================
// ORDERS
// ==========================================

async function loadOrders(status = null) {
    try {
        let url = '/api/orders?limit=100';
        if (status && status !== 'all') {
            url += `&status=${status}`;
        }
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayOrders(data.orders);
        }
    } catch (error) {
        console.error('Load orders error:', error);
    }
}

function displayOrders(orders) {
    const container = document.getElementById('ordersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">📭</div>
                <p class="text-lg font-bold mb-2">אין הזמנות</p>
                <p class="text-sm">צור הזמנה חדשה כדי להתחיל</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="bg-slate-700 rounded-xl p-4 border border-slate-600">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-lg font-bold">${order.order_number}</span>
                        ${getStatusBadge(order.status)}
                    </div>
                    <p class="text-sm text-slate-400">
                        ${new Date(order.created_at).toLocaleDateString('he-IL')} • 
                        ${order.created_by_name || 'מערכת'}
                    </p>
                </div>
                <div class="text-left">
                    <p class="text-xl font-bold text-emerald-400">₪${order.price}</p>
                    <p class="text-xs text-slate-400">${order.distance_km} ק"מ</p>
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
                ${order.courier_first_name ? `
                <div class="flex items-center gap-2 bg-slate-600 rounded p-2">
                    <span>🏍️</span>
                    <p>שליח: <strong>${order.courier_first_name} ${order.courier_last_name}</strong></p>
                </div>
                ` : ''}
            </div>
            
            <div class="flex gap-2">
                ${order.status === 'new' ? `
                    <button onclick="publishOrder(${order.id})" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg text-sm font-bold">
                        📢 פרסם לשליחים
                    </button>
                ` : ''}
                ${order.status === 'new' || order.status === 'published' ? `
                    <button onclick="cancelOrder(${order.id})" class="flex-1 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-bold">
                        ❌ בטל
                    </button>
                ` : ''}
                <button onclick="viewOrderDetails(${order.id})" class="flex-1 bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-bold">
                    👁️ פרטים
                </button>
            </div>
        </div>
    `).join('');
}

function getStatusBadge(status) {
    const badges = {
        'new': '<span class="px-3 py-1 rounded-full text-xs bg-slate-500/20 text-slate-300 border border-slate-500/50">חדש</span>',
        'published': '<span class="px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/50">מפורסם</span>',
        'taken': '<span class="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/50">נתפס</span>',
        'picked': '<span class="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400 border border-purple-500/50">נאסף</span>',
        'delivered': '<span class="px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">נמסר</span>',
        'cancelled': '<span class="px-3 py-1 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/50">בוטל</span>'
    };
    return badges[status] || '';
}

async function publishOrder(orderId) {
    if (!confirm('האם לפרסם את ההזמנה לשליחים?')) return;
    
    try {
        const response = await fetch(`/api/orders/${orderId}/publish`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            showNotification('✅ ההזמנה פורסמה בהצלחה!');
            loadOrders();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Publish error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function cancelOrder(orderId) {
    const reason = prompt('סיבת ביטול (אופציונלי):');
    if (reason === null) return;
    
    try {
        const response = await fetch(`/api/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
            showNotification('✅ ההזמנה בוטלה');
            loadOrders();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Cancel error:', error);
    }
}

function viewOrderDetails(orderId) {
    showNotification('📋 פרטי הזמנה - בקרוב!');
}

// ==========================================
// CREATE ORDER MODAL
// ==========================================

function showCreateOrderModal() {
    showNotification('📦 טופס יצירת הזמנה - בשלבי פיתוח');
    showNotification('💡 בינתיים השתמש בטופס הלקוח: ' + window.location.origin + '/customer/order.html');
}

function closeCreateOrderModal() {
    document.getElementById('createOrderModal')?.classList.add('hidden');
}

// ==========================================
// FILTERS
// ==========================================

function filterOrders(status) {
    currentFilter = status;
    
    // Update buttons
    document.querySelectorAll('.filter-btn, .filter-btn-active').forEach(btn => {
        btn.className = 'filter-btn px-4 py-2 rounded-lg';
    });
    
    const btnId = 'filter' + status.charAt(0).toUpperCase() + status.slice(1);
    const activeBtn = document.getElementById(btnId);
    if (activeBtn) {
        activeBtn.className = 'filter-btn-active px-4 py-2 rounded-lg';
    }
    
    loadOrders(status === 'all' ? null : status);
}

// ==========================================
// TABS
// ==========================================

function switchTab(tab) {
    // Update tabs
    document.querySelectorAll('[id^="tab"]').forEach(t => t.className = 'tab-inactive px-6 py-3');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).className = 'tab-active px-6 py-3 font-bold';
    document.getElementById(`${tab}Tab`).classList.remove('hidden');
    
    // Load data
    if (tab === 'orders') loadOrders();
    if (tab === 'couriers') loadCouriers();
    if (tab === 'payments') loadPayments();
}

// ==========================================
// COURIERS
// ==========================================

async function loadCouriers() {
    try {
        const response = await fetch('/api/couriers', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayCouriers(data.couriers);
        }
    } catch (error) {
        console.error('Load couriers error:', error);
    }
}

function displayCouriers(couriers) {
    const container = document.getElementById('couriersList');
    
    if (!couriers || couriers.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">🏍️</div>
                <p>אין שליחים רשומים</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = couriers.map(courier => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-lg">${courier.first_name} ${courier.last_name}</p>
                    <p class="text-sm text-slate-400">📞 ${courier.phone}</p>
                    <p class="text-sm text-slate-400">🚗 ${getVehicleNameHebrew(courier.vehicle_type)}</p>
                    <div class="mt-2 flex items-center gap-2">
                        ${getCourierStatusBadge(courier.status)}
                        <span class="text-xs text-slate-400">⭐ ${courier.rating} • ${courier.total_deliveries} משלוחים</span>
                    </div>
                </div>
                <div class="text-left">
                    <p class="text-lg font-bold text-emerald-400">₪${parseFloat(courier.balance).toLocaleString()}</p>
                    <p class="text-xs text-slate-400">יתרה</p>
                    <button onclick="toggleCourierStatus(${courier.id}, '${courier.status}')" 
                            class="mt-2 px-3 py-1 rounded text-xs ${courier.status === 'active' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}">
                        ${courier.status === 'active' ? '🔴 השהה' : '✅ הפעל'}
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function getCourierStatusBadge(status) {
    const badges = {
        'active': '<span class="px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">פעיל</span>',
        'inactive': '<span class="px-2 py-1 rounded-full text-xs bg-slate-500/20 text-slate-400 border border-slate-500/50">לא פעיל</span>',
        'blocked': '<span class="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/50">חסום</span>'
    };
    return badges[status] || '';
}

async function toggleCourierStatus(courierId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    
    try {
        const response = await fetch(`/api/couriers/${courierId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (response.ok) {
            showNotification('✅ סטטוס שונה בהצלחה');
            loadCouriers();
        } else {
            showNotification('❌ שגיאה בשינוי סטטוס', 'error');
        }
    } catch (error) {
        console.error('Toggle status error:', error);
    }
}

// ==========================================
// PAYMENTS
// ==========================================

async function loadPayments() {
    try {
        const response = await fetch('/api/payments/payout-requests', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayPayments(data.requests);
        }
    } catch (error) {
        console.error('Load payments error:', error);
    }
}

function displayPayments(requests) {
    const container = document.getElementById('paymentsList');
    
    if (!requests || requests.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">💰</div>
                <p>אין בקשות משיכה</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = requests.map(req => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <p class="font-bold text-lg">${req.courier_first_name} ${req.courier_last_name}</p>
                    <p class="text-sm text-slate-400">📞 ${req.courier_phone}</p>
                    <p class="text-sm text-slate-400">📅 ${new Date(req.created_at).toLocaleDateString('he-IL')}</p>
                </div>
                <div class="text-left">
                    <p class="text-2xl font-bold text-emerald-400">₪${parseFloat(req.amount).toLocaleString()}</p>
                    ${getPaymentStatusBadge(req.status)}
                </div>
            </div>
            ${req.status === 'pending' ? `
                <div class="flex gap-2">
                    <button onclick="approvePayoutRequest(${req.id})" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg font-bold">
                        ✅ אשר
                    </button>
                    <button onclick="rejectPayoutRequest(${req.id})" class="flex-1 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg font-bold">
                        ❌ דחה
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function getPaymentStatusBadge(status) {
    const badges = {
        'pending': '<span class="px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/50">ממתין</span>',
        'approved': '<span class="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/50">אושר</span>',
        'rejected': '<span class="px-3 py-1 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/50">נדחה</span>',
        'completed': '<span class="px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">הושלם</span>'
    };
    return badges[status] || '';
}

async function approvePayoutRequest(requestId) {
    if (!confirm('האם לאשר את בקשת המשיכה?')) return;
    
    try {
        const response = await fetch(`/api/payments/payout-requests/${requestId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            showNotification('✅ בקשה אושרה');
            loadPayments();
        } else {
            showNotification('❌ שגיאה באישור', 'error');
        }
    } catch (error) {
        console.error('Approve error:', error);
    }
}

async function rejectPayoutRequest(requestId) {
    const reason = prompt('סיבת דחייה:');
    if (!reason) return;
    
    try {
        const response = await fetch(`/api/payments/payout-requests/${requestId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
            showNotification('✅ בקשה נדחתה');
            loadPayments();
        } else {
            showNotification('❌ שגיאה בדחייה', 'error');
        }
    } catch (error) {
        console.error('Reject error:', error);
    }
}

// ==========================================
// HELPERS
// ==========================================

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
