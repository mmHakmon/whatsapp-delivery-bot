// ==========================================
// M.M.H DELIVERY - ADMIN DASHBOARD
// ==========================================

let token = localStorage.getItem('adminToken');
let currentFilter = 'all';
let ws = null;

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
            token = data.accessToken;
            localStorage.setItem('adminToken', token);
            localStorage.setItem('refreshToken', data.refreshToken);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('mainContent').classList.remove('hidden');
            
            document.getElementById('userName').textContent = data.user.name;
            document.getElementById('userRole').textContent = data.user.role === 'admin' ? 'מנהל' : 'מנהל תפעול';
            
            initDashboard();
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
    localStorage.clear();
    location.reload();
}

function checkAuth() {
    if (!token) {
        document.getElementById('loginModal').classList.remove('hidden');
        document.getElementById('mainContent').classList.add('hidden');
    } else {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        document.getElementById('userName').textContent = user.name || 'Admin';
        document.getElementById('userRole').textContent = user.role === 'admin' ? 'מנהל' : 'מנהל תפעול';
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        initDashboard();
    }
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
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        ws.send(JSON.stringify({
            type: 'auth',
            userId: user.id,
            role: user.role,
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
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'new_order':
            showNotification('📦 הזמנה חדשה נוצרה!');
            loadOrders();
            loadStatistics();
            break;
        case 'order_updated':
        case 'order_taken':
        case 'order_picked':
        case 'order_delivered':
            loadOrders();
            loadStatistics();
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
        const response = await fetch('/api/orders/statistics', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const stats = data.statistics;
            
            document.getElementById('statTotalOrders').textContent = stats.total_orders || 0;
            document.getElementById('statActiveOrders').textContent = 
                (parseInt(stats.taken_orders || 0) + parseInt(stats.picked_orders || 0));
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

async function loadOrders() {
    try {
        const url = currentFilter === 'all' 
            ? '/api/orders' 
            : `/api/orders?status=${currentFilter}`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
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
            <div class="text-center py-8 text-slate-400">
                <div class="text-6xl mb-4">📭</div>
                <p>אין הזמנות להצגה</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-lg font-bold">${order.order_number}</span>
                        ${getStatusBadge(order.status)}
                    </div>
                    <p class="text-sm text-slate-400">
                        ${new Date(order.created_at).toLocaleString('he-IL')}
                    </p>
                </div>
                <div class="text-left">
                    <p class="text-xl font-bold text-emerald-400">₪${order.price}</p>
                    <p class="text-xs text-slate-400">${order.distance_km} ק"מ</p>
                </div>
            </div>
            
            <div class="space-y-2 text-sm mb-3">
                <div class="flex items-start gap-2">
                    <span>📤</span>
                    <div>
                        <p class="font-medium">${order.sender_name} • ${order.sender_phone}</p>
                        <p class="text-slate-400">${order.pickup_address}</p>
                    </div>
                </div>
                <div class="flex items-start gap-2">
                    <span>📥</span>
                    <div>
                        <p class="font-medium">${order.receiver_name} • ${order.receiver_phone}</p>
                        <p class="text-slate-400">${order.delivery_address}</p>
                    </div>
                </div>
                ${order.courier_first_name ? `
                <div class="flex items-center gap-2 bg-slate-600 rounded p-2">
                    <span>🏍️</span>
                    <p>שליח: <strong>${order.courier_first_name} ${order.courier_last_name}</strong> • ${order.courier_phone}</p>
                </div>
                ` : ''}
            </div>
            
            <div class="flex gap-2">
                ${order.status === 'new' ? `
                    <button onclick="publishOrder(${order.id})" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg text-sm font-bold">
                        📤 פרסם
                    </button>
                ` : ''}
                ${order.status !== 'delivered' && order.status !== 'cancelled' ? `
                    <button onclick="cancelOrder(${order.id})" class="flex-1 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-bold">
                        ❌ בטל
                    </button>
                ` : ''}
                <button onclick="viewOrderDetails(${order.id})" class="flex-1 bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg text-sm">
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
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showNotification('✅ ההזמנה פורסמה בהצלחה!');
            loadOrders();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה בפרסום'), 'error');
        }
    } catch (error) {
        console.error('Publish error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function cancelOrder(orderId) {
    const reason = prompt('סיבת ביטול:');
    if (!reason) return;
    
    try {
        const response = await fetch(`/api/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
            showNotification('✅ ההזמנה בוטלה');
            loadOrders();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה בביטול'), 'error');
        }
    } catch (error) {
        console.error('Cancel error:', error);
    }
}

function viewOrderDetails(orderId) {
    // TODO: Show order details modal
    alert('פרטי הזמנה - בקרוב!');
}

function filterOrders(status) {
    currentFilter = status;
    
    // Update button styles
    document.querySelectorAll('[id^="filter"]').forEach(btn => {
        btn.className = 'filter-btn px-4 py-2 rounded-lg';
    });
    document.getElementById('filter' + status.charAt(0).toUpperCase() + status.slice(1)).className = 'filter-btn-active px-4 py-2 rounded-lg';
    
    loadOrders();
}

// ==========================================
// CREATE ORDER MODAL
// ==========================================

function showCreateOrderModal() {
    // TODO: Show create order modal
    alert('יצירת הזמנה חדשה - בקרוב!\n\nאו השתמש בדף הלקוח: /');
}

// ==========================================
// COURIERS
// ==========================================

async function loadCouriers() {
    try {
        const response = await fetch('/api/couriers', {
            headers: { 'Authorization': `Bearer ${token}` }
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
            <div class="text-center py-8 text-slate-400">
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
                    <h3 class="text-lg font-bold mb-1">${courier.first_name} ${courier.last_name}</h3>
                    <p class="text-sm text-slate-400 mb-2">📞 ${courier.phone}</p>
                    <div class="flex gap-2 items-center">
                        <span class="text-2xl">${getVehicleEmoji(courier.vehicle_type)}</span>
                        <span class="text-sm text-slate-300">${getVehicleNameHebrew(courier.vehicle_type)}</span>
                        ${courier.status === 'active' 
                            ? '<span class="px-2 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400">פעיל</span>'
                            : '<span class="px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-400">חסום</span>'
                        }
                    </div>
                </div>
                <div class="text-left">
                    <p class="text-2xl font-bold text-emerald-400">₪${parseFloat(courier.balance || 0).toLocaleString()}</p>
                    <p class="text-xs text-slate-400">יתרה</p>
                    <p class="text-sm text-slate-300 mt-2">⭐ ${parseFloat(courier.rating || 5).toFixed(1)}</p>
                    <p class="text-xs text-slate-400">${courier.total_deliveries || 0} משלוחים</p>
                </div>
            </div>
            <div class="mt-3 flex gap-2">
                <button onclick="toggleCourierStatus(${courier.id}, '${courier.status === 'active' ? 'blocked' : 'active'}')"
                        class="${courier.status === 'active' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'} flex-1 px-4 py-2 rounded-lg text-sm font-bold">
                    ${courier.status === 'active' ? '🚫 חסום' : '✅ הפעל'}
                </button>
                <button onclick="viewCourierDetails(${courier.id})" class="flex-1 bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg text-sm">
                    📊 פרטים
                </button>
            </div>
        </div>
    `).join('');
}

async function toggleCourierStatus(courierId, newStatus) {
    try {
        const response = await fetch(`/api/couriers/${courierId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (response.ok) {
            showNotification('✅ סטטוס שליח עודכן');
            loadCouriers();
        }
    } catch (error) {
        console.error('Toggle status error:', error);
    }
}

function viewCourierDetails(courierId) {
    // TODO: Show courier details modal
    alert('פרטי שליח - בקרוב!');
}

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

// ==========================================
// PAYMENTS
// ==========================================

async function loadPayments() {
    try {
        const response = await fetch('/api/payments/requests', {
            headers: { 'Authorization': `Bearer ${token}` }
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
            <div class="text-center py-8 text-slate-400">
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
                    <h3 class="text-lg font-bold mb-1">${req.courier_name}</h3>
                    <p class="text-sm text-slate-400">📞 ${req.courier_phone}</p>
                    <p class="text-xs text-slate-400 mt-1">${new Date(req.created_at).toLocaleString('he-IL')}</p>
                </div>
                <div class="text-left">
                    <p class="text-2xl font-bold text-emerald-400">₪${parseFloat(req.amount).toLocaleString()}</p>
                    ${getPaymentStatusBadge(req.status)}
                </div>
            </div>
            <div class="text-sm mb-3">
                <p><strong>אמצעי תשלום:</strong> ${getPaymentMethodName(req.payment_method)}</p>
                ${req.admin_notes ? `<p class="text-slate-400 mt-1">📝 ${req.admin_notes}</p>` : ''}
            </div>
            ${req.status === 'pending' ? `
                <div class="flex gap-2">
                    <button onclick="approvePayoutRequest(${req.id})" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-lg text-sm font-bold">
                        ✅ אשר
                    </button>
                    <button onclick="rejectPayoutRequest(${req.id})" class="flex-1 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-bold">
                        ❌ דחה
                    </button>
                </div>
            ` : req.status === 'approved' ? `
                <button onclick="completePayoutRequest(${req.id})" class="w-full bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-bold">
                    💸 סמן כהועבר
                </button>
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

function getPaymentMethodName(method) {
    const names = {
        'bank_transfer': 'העברה בנקאית',
        'bit': 'ביט',
        'cash': 'מזומן'
    };
    return names[method] || method;
}

async function approvePayoutRequest(requestId) {
    const notes = prompt('הערות (אופציונלי):');
    
    try {
        const response = await fetch(`/api/payments/requests/${requestId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notes })
        });
        
        if (response.ok) {
            showNotification('✅ בקשה אושרה');
            loadPayments();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Approve error:', error);
    }
}

async function rejectPayoutRequest(requestId) {
    const reason = prompt('סיבת דחייה:');
    if (!reason) return;
    
    try {
        const response = await fetch(`/api/payments/requests/${requestId}/reject`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        if (response.ok) {
            showNotification('✅ בקשה נדחתה');
            loadPayments();
        }
    } catch (error) {
        console.error('Reject error:', error);
    }
}

async function completePayoutRequest(requestId) {
    if (!confirm('האם התשלום בוצע? פעולה זו תקזז את הכסף מיתרת השליח.')) return;
    
    try {
        const response = await fetch(`/api/payments/requests/${requestId}/complete`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showNotification('✅ התשלום הושלם');
            loadPayments();
        }
    } catch (error) {
        console.error('Complete error:', error);
    }
}

// ==========================================
// TABS
// ==========================================

function switchTab(tab) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('[id^="tab"]').forEach(t => t.className = 'tab-inactive px-6 py-3');
    
    // Show selected tab
    document.getElementById(`${tab}Tab`).classList.remove('hidden');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).className = 'tab-active px-6 py-3 font-bold';
    
    // Load data
    if (tab === 'orders') loadOrders();
    if (tab === 'couriers') loadCouriers();
    if (tab === 'payments') loadPayments();
}

// ==========================================
// NOTIFICATIONS
// ==========================================

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