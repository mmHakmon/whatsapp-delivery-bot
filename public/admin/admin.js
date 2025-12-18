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
            
            // הכנסות ורווח נקי
            const totalRevenue = parseFloat(stats.total_revenue || 0);
            
            // חישוב עמלה (רווח) - 25% מההכנסות
            const commissionRate = 0.25;
            const netProfit = Math.floor(totalRevenue * commissionRate);
            const courierPayout = totalRevenue - netProfit;
            
            document.getElementById('statRevenue').textContent = `₪${totalRevenue.toLocaleString()}`;
            
            // הוסף רווח נקי אם יש אלמנט
            const netProfitEl = document.getElementById('statNetProfit');
            if (netProfitEl) {
                netProfitEl.textContent = `₪${netProfit.toLocaleString()}`;
            }
            
            // הוסף תשלום לשליחים אם יש אלמנט
            const courierPayoutEl = document.getElementById('statCourierPayout');
            if (courierPayoutEl) {
                courierPayoutEl.textContent = `₪${courierPayout.toLocaleString()}`;
            }
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
                        ${order.created_by_name || 'לקוח'}
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
                        📢 פרסם
                    </button>
                    <button onclick="editOrder(${order.id})" class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm">
                        ✏️
                    </button>
                ` : ''}
                ${order.status !== 'delivered' && order.status !== 'cancelled' ? `
                    <button onclick="cancelOrder(${order.id})" class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm">
                        ❌
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
    if (!confirm('האם לפרסם את ההזמנה לשליחים ב-WhatsApp?')) return;
    
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
    fetch(`/api/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    })
    .then(res => res.json())
    .then(data => {
        const order = data.order;
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h2 class="text-2xl font-bold mb-2">${order.order_number}</h2>
                        ${getStatusBadge(order.status)}
                    </div>
                    <button onclick="this.closest('.fixed').remove()" class="text-4xl hover:text-red-500">&times;</button>
                </div>
                
                <div class="space-y-4">
                    <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                        <p class="font-bold text-blue-400 mb-2">📤 פרטי שולח</p>
                        <p><strong>שם:</strong> ${order.sender_name}</p>
                        <p><strong>טלפון:</strong> ${order.sender_phone}</p>
                        <p><strong>כתובת:</strong> ${order.pickup_address}</p>
                        ${order.pickup_notes ? `<p class="text-sm text-slate-400 mt-2">📝 ${order.pickup_notes}</p>` : ''}
                    </div>
                    
                    <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                        <p class="font-bold text-emerald-400 mb-2">📥 פרטי מקבל</p>
                        <p><strong>שם:</strong> ${order.receiver_name}</p>
                        <p><strong>טלפון:</strong> ${order.receiver_phone}</p>
                        <p><strong>כתובת:</strong> ${order.delivery_address}</p>
                        ${order.delivery_notes ? `<p class="text-sm text-slate-400 mt-2">📝 ${order.delivery_notes}</p>` : ''}
                    </div>
                    
                    ${order.courier_first_name ? `
                    <div class="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                        <p class="font-bold text-purple-400 mb-2">🏍️ פרטי שליח</p>
                        <p><strong>שם:</strong> ${order.courier_first_name} ${order.courier_last_name}</p>
                        <p><strong>טלפון:</strong> ${order.courier_phone}</p>
                        <p><strong>רכב:</strong> ${getVehicleNameHebrew(order.courier_vehicle_type)}</p>
                    </div>
                    ` : ''}
                    
                    <div class="bg-slate-700 rounded-lg p-4">
                        <p class="font-bold mb-2">💰 פרטי מחיר</p>
                        <div class="space-y-1 text-sm">
                            <div class="flex justify-between">
                                <span>מרחק:</span>
                                <span>${order.distance_km} ק"מ</span>
                            </div>
                            <div class="flex justify-between">
                                <span>מחיר לפני מע"מ:</span>
                                <span>₪${(order.price - order.vat).toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>מע"מ:</span>
                                <span>₪${order.vat}</span>
                            </div>
                            <div class="h-px bg-slate-600 my-2"></div>
                            <div class="flex justify-between font-bold text-lg">
                                <span>סה"כ:</span>
                                <span class="text-emerald-400">₪${order.price}</span>
                            </div>
                            <div class="flex justify-between text-slate-400">
                                <span>עמלה (${order.commission_rate}%):</span>
                                <span>₪${order.commission}</span>
                            </div>
                            <div class="flex justify-between">
                                <span>תשלום לשליח:</span>
                                <span class="text-emerald-400">₪${order.courier_payout}</span>
                            </div>
                        </div>
                    </div>
                    
                    ${order.package_description ? `
                    <div class="bg-slate-700 rounded-lg p-4">
                        <p class="font-bold mb-2">📦 תיאור חבילה</p>
                        <p class="text-slate-300">${order.package_description}</p>
                    </div>
                    ` : ''}
                </div>
                
                <div class="mt-6 flex gap-3">
                    ${order.status === 'new' ? `
                        <button onclick="publishOrder(${order.id}); this.closest('.fixed').remove();" class="flex-1 bg-emerald-500 hover:bg-emerald-600 font-bold py-3 rounded-lg">
                            📢 פרסם לשליחים
                        </button>
                    ` : ''}
                    ${order.status !== 'delivered' && order.status !== 'cancelled' ? `
                        <button onclick="cancelOrder(${order.id}); this.closest('.fixed').remove();" class="flex-1 bg-red-500 hover:bg-red-600 font-bold py-3 rounded-lg">
                            ❌ בטל הזמנה
                        </button>
                    ` : ''}
                    <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded-lg">
                        סגור
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    });
}

function editOrder(orderId) {
    showNotification('✏️ עריכת הזמנה - בקרוב!');
    // TODO: Implement edit functionality
}

// ==========================================
// CREATE ORDER MODAL
// ==========================================

function showCreateOrderModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold">📦 הזמנה חדשה</h2>
                <button onclick="this.closest('.fixed').remove()" class="text-4xl hover:text-red-500">&times;</button>
            </div>
            
            <form id="createOrderForm" onsubmit="handleCreateOrder(event)" class="space-y-4">
                <!-- Sender Details -->
                <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <h3 class="font-bold text-blue-400 mb-3">📤 פרטי שולח</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm mb-1">שם מלא</label>
                            <input type="text" name="senderName" required
                                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">טלפון</label>
                            <input type="tel" name="senderPhone" required pattern="[0-9]{10}"
                                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                        </div>
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm mb-1">כתובת איסוף</label>
                        <input type="text" name="pickupAddress" required
                               class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm mb-1">הערות לאיסוף</label>
                        <input type="text" name="pickupNotes"
                               class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                    </div>
                </div>
                
                <!-- Receiver Details -->
                <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <h3 class="font-bold text-emerald-400 mb-3">📥 פרטי מקבל</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm mb-1">שם מלא</label>
                            <input type="text" name="receiverName" required
                                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">טלפון</label>
                            <input type="tel" name="receiverPhone" required pattern="[0-9]{10}"
                                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                        </div>
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm mb-1">כתובת מסירה</label>
                        <input type="text" name="deliveryAddress" required
                               class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm mb-1">הערות למסירה</label>
                        <input type="text" name="deliveryNotes"
                               class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                    </div>
                </div>
                
                <!-- Package Details -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold mb-3">📦 פרטי חבילה</h3>
                    <div class="mb-3">
                        <label class="block text-sm mb-1">תיאור חבילה</label>
                        <input type="text" name="packageDescription"
                               class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm">
                    </div>
                    <div class="mb-3">
                        <label class="block text-sm mb-1">סוג רכב</label>
                        <select name="vehicleType" required
                                class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm">
                            <option value="motorcycle">🏍️ אופנוע - ₪70</option>
                            <option value="car">🚗 רכב פרטי - ₪75</option>
                            <option value="van">🚐 מסחרית - ₪120</option>
                            <option value="truck">🚚 משאית - ₪200</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm mb-1">הערות כלליות</label>
                        <textarea name="notes" rows="2"
                                  class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm"></textarea>
                    </div>
                </div>
                
                <div class="flex gap-3 pt-4">
                    <button type="submit" class="flex-1 bg-emerald-500 hover:bg-emerald-600 font-bold py-3 rounded-lg">
                        ✅ צור הזמנה
                    </button>
                    <button type="button" onclick="this.closest('.fixed').remove()" 
                            class="flex-1 bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded-lg">
                        ביטול
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function handleCreateOrder(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const data = {
        senderName: formData.get('senderName'),
        senderPhone: formData.get('senderPhone'),
        pickupAddress: formData.get('pickupAddress'),
        pickupNotes: formData.get('pickupNotes'),
        receiverName: formData.get('receiverName'),
        receiverPhone: formData.get('receiverPhone'),
        deliveryAddress: formData.get('deliveryAddress'),
        deliveryNotes: formData.get('deliveryNotes'),
        packageDescription: formData.get('packageDescription'),
        vehicleType: formData.get('vehicleType'),
        notes: formData.get('notes')
    };
    
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(`✅ הזמנה ${result.order.order_number} נוצרה בהצלחה!`);
            
            // Close modal
            event.target.closest('.fixed').remove();
            
            // Reload orders
            loadOrders();
            loadStatistics();
        } else {
            const error = await response.json();
            showNotification('❌ ' + (error.error || 'שגיאה ביצירת הזמנה'), 'error');
        }
    } catch (error) {
        console.error('Create order error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
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
        const response = await fetch('/api/payments/requests', {
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
                    <p class="font-bold text-lg">${req.courier_name}</p>
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
        const response = await fetch(`/api/payments/requests/${requestId}/approve`, {
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
        const response = await fetch(`/api/payments/requests/${requestId}/reject`, {
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

// ==========================================
// SETTINGS TAB
// ==========================================

function showSettings() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold">⚙️ הגדרות מערכת</h2>
                <button onclick="this.closest('.fixed').remove()" class="text-4xl hover:text-red-500">&times;</button>
            </div>
            
            <div class="space-y-4">
                <!-- Statistics Management -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold text-lg mb-3">📊 ניהול סטטיסטיקות</h3>
                    <div class="space-y-3">
                        <button onclick="resetStatistics('today')" class="w-full bg-blue-500 hover:bg-blue-600 px-4 py-3 rounded-lg text-left">
                            🔄 איפוס סטטיסטיקות יומיות
                        </button>
                        <button onclick="resetStatistics('week')" class="w-full bg-blue-500 hover:bg-blue-600 px-4 py-3 rounded-lg text-left">
                            🔄 איפוס סטטיסטיקות שבועיות
                        </button>
                        <button onclick="resetStatistics('month')" class="w-full bg-blue-500 hover:bg-blue-600 px-4 py-3 rounded-lg text-left">
                            🔄 איפוס סטטיסטיקות חודשיות
                        </button>
                        <button onclick="resetStatistics('all')" class="w-full bg-red-500 hover:bg-red-600 px-4 py-3 rounded-lg text-left font-bold">
                            ⚠️ איפוס כל הסטטיסטיקות
                        </button>
                    </div>
                </div>
                
                <!-- Orders Management -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold text-lg mb-3">📦 ניהול הזמנות</h3>
                    <div class="space-y-3">
                        <button onclick="deleteOldOrders()" class="w-full bg-orange-500 hover:bg-orange-600 px-4 py-3 rounded-lg text-left">
                            🗑️ מחק הזמנות ישנות (מעל 6 חודשים)
                        </button>
                        <button onclick="archiveDeliveredOrders()" class="w-full bg-orange-500 hover:bg-orange-600 px-4 py-3 rounded-lg text-left">
                            📁 העבר הזמנות שהושלמו לארכיון
                        </button>
                    </div>
                </div>
                
                <!-- System Settings -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold text-lg mb-3">⚙️ הגדרות מערכת</h3>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-sm mb-2">אחוז עמלה (%)</label>
                            <input type="number" id="commissionRate" value="25" min="0" max="100" step="1"
                                   class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm mb-2">מע"מ (%)</label>
                            <input type="number" id="vatRate" value="18" min="0" max="30" step="1"
                                   class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2">
                        </div>
                        <button onclick="saveSystemSettings()" class="w-full bg-emerald-500 hover:bg-emerald-600 px-4 py-3 rounded-lg font-bold">
                            💾 שמור הגדרות
                        </button>
                    </div>
                </div>
                
                <!-- User Management -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold text-lg mb-3">👥 ניהול משתמשים</h3>
                    <div class="space-y-3">
                        <button onclick="showAddAgent()" class="w-full bg-purple-500 hover:bg-purple-600 px-4 py-3 rounded-lg text-left">
                            ➕ הוסף נציג חדש
                        </button>
                        <button onclick="manageAgents()" class="w-full bg-purple-500 hover:bg-purple-600 px-4 py-3 rounded-lg text-left">
                            📋 ניהול נציגים
                        </button>
                    </div>
                </div>
                
                <!-- Danger Zone -->
                <div class="bg-red-500/10 border border-red-500 rounded-lg p-4">
                    <h3 class="font-bold text-lg mb-3 text-red-400">⚠️ אזור מסוכן</h3>
                    <div class="space-y-3">
                        <button onclick="dangerResetAll()" class="w-full bg-red-600 hover:bg-red-700 px-4 py-3 rounded-lg font-bold">
                            💀 איפוס מלא של המערכת
                        </button>
                        <p class="text-xs text-red-300">פעולה זו תמחק את כל הנתונים ללא אפשרות שחזור!</p>
                    </div>
                </div>
            </div>
            
            <button onclick="this.closest('.fixed').remove()" class="w-full mt-6 bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded-lg">
                סגור
            </button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

async function resetStatistics(period) {
    const messages = {
        'today': 'האם לאפס את הסטטיסטיקות של היום?',
        'week': 'האם לאפס את הסטטיסטיקות של השבוע?',
        'month': 'האם לאפס את הסטטיסטיקות של החודש?',
        'all': 'האם לאפס את כל הסטטיסטיקות? (פעולה בלתי הפיכה!)'
    };
    
    if (!confirm(messages[period])) return;
    
    // Map frontend values to backend values
    const periodMap = {
        'today': 'daily',
        'week': 'weekly',
        'month': 'monthly',
        'all': 'all'
    };
    
    const backendPeriod = periodMap[period] || period;
    
    try {
        const response = await fetch(`/api/admin/reset-statistics`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ period: backendPeriod })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ ${data.message || 'סטטיסטיקות אופסו בהצלחה!'}`);
            loadStatistics();
        } else {
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Reset statistics error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function deleteOldOrders() {
    const months = prompt('כמה חודשים לאחור למחוק? (ברירת מחדל: 6)', '6');
    if (!months) return;
    
    if (!confirm(`האם למחוק הזמנות ישנות מעל ${months} חודשים?`)) return;
    
    try {
        const response = await fetch('/api/admin/delete-old-orders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ months: parseInt(months) })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ ${data.message || `נמחקו ${data.deleted} הזמנות ישנות`}`);
            loadOrders();
        } else {
            showNotification('❌ ' + (data.error || 'שגיאה במחיקה'), 'error');
        }
    } catch (error) {
        console.error('Delete old orders error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function archiveDeliveredOrders() {
    const days = prompt('כמה ימים לאחור לארכב? (ברירת מחדל: 30)', '30');
    if (!days) return;
    
    if (!confirm(`האם להעביר הזמנות שהושלמו לפני ${days} ימים לארכיון?`)) return;
    
    showNotification('⏳ מעביר לארכיון...');
    
    try {
        const response = await fetch('/api/admin/archive-delivered', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ days: parseInt(days) })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ ${data.message || `${data.archived} הזמנות הועברו לארכיון`}`);
            loadOrders();
        } else {
            showNotification('❌ ' + (data.error || 'שגיאה בארכוב'), 'error');
        }
    } catch (error) {
        console.error('Archive error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function saveSystemSettings() {
    const commission = document.getElementById('commissionRate').value;
    const vat = document.getElementById('vatRate').value;
    
    showNotification('💾 שומר הגדרות...');
    showNotification('ℹ️ הגדרות אלו דורשות שינוי ב-Environment Variables ב-Render', 'error');
}

function showAddAgent() {
    showNotification('👥 הוספת נציג - בקרוב!');
}

function manageAgents() {
    showNotification('📋 ניהול נציגים - בקרוב!');
}

async function dangerResetAll() {
    if (!confirm('⚠️ האם אתה בטוח שברצונך למחוק את כל הנתונים?')) return;
    if (!confirm('⚠️⚠️ פעולה זו תמחק הכל ללא אפשרות שחזור! האם להמשיך?')) return;
    
    const password = prompt('הזן את סיסמת המנהל לאישור:');
    if (!password) return;
    
    showNotification('🔥 מוחק את כל הנתונים...', 'error');
    showNotification('⚠️ פונקציה זו מושבתת למניעת מחיקה בטעות', 'error');
}

// ==========================================
// USER MANAGEMENT
// ==========================================

async function showAddAgent() {
    const modal = document.createElement('div');
    modal.id = 'addAgentModal';
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-700">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold">➕ הוסף נציג חדש</h2>
                <button onclick="closeAddAgent()" class="text-slate-400 hover:text-white text-3xl">×</button>
            </div>
            
            <form id="addAgentForm" onsubmit="handleAddAgent(event)" class="space-y-4">
                <div>
                    <label class="block text-sm mb-2">שם משתמש *</label>
                    <input type="text" id="agentUsername" required minlength="3"
                           class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                </div>
                
                <div>
                    <label class="block text-sm mb-2">סיסמה *</label>
                    <input type="password" id="agentPassword" required minlength="6"
                           class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                </div>
                
                <div>
                    <label class="block text-sm mb-2">תפקיד *</label>
                    <select id="agentRole" required
                            class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                        <option value="agent">נציג</option>
                        <option value="admin">מנהל</option>
                    </select>
                </div>
                
                <div class="flex gap-3 mt-6">
                    <button type="submit" class="flex-1 bg-emerald-500 hover:bg-emerald-600 py-3 rounded-lg font-bold">
                        ✅ הוסף נציג
                    </button>
                    <button type="button" onclick="closeAddAgent()" 
                            class="flex-1 bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">
                        ביטול
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAddAgent();
    });
}

function closeAddAgent() {
    const modal = document.getElementById('addAgentModal');
    if (modal) modal.remove();
}

async function handleAddAgent(event) {
    event.preventDefault();
    
    const username = document.getElementById('agentUsername').value;
    const password = document.getElementById('agentPassword').value;
    const role = document.getElementById('agentRole').value;
    
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, role })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ נציג ${username} נוסף בהצלחה!`);
            closeAddAgent();
            // Refresh users list if open
            if (document.getElementById('manageAgentsModal')) {
                manageAgents();
            }
        } else {
            showNotification(`❌ ${data.error || 'שגיאה בהוספת נציג'}`, 'error');
        }
    } catch (error) {
        console.error('Add agent error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function manageAgents() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showNotification('❌ שגיאה בטעינת נציגים', 'error');
            return;
        }
        
        const users = data.users || [];
        
        // Get current user ID from token
        let currentUserId = null;
        try {
            const tokenData = JSON.parse(atob(adminToken.split('.')[1]));
            currentUserId = tokenData.id;
        } catch (e) {
            console.error('Error parsing token:', e);
        }
        
        const modal = document.createElement('div');
        modal.id = 'manageAgentsModal';
        modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-slate-800 rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold">👥 ניהול נציגים</h2>
                    <button onclick="closeManageAgents()" class="text-slate-400 hover:text-white text-3xl">×</button>
                </div>
                
                ${users.length === 0 ? `
                    <div class="text-center py-12 text-slate-400">
                        <p class="text-xl mb-4">אין נציגים במערכת</p>
                        <button onclick="closeManageAgents(); showAddAgent();" 
                                class="bg-emerald-500 hover:bg-emerald-600 px-6 py-3 rounded-lg font-bold">
                            ➕ הוסף נציג ראשון
                        </button>
                    </div>
                ` : `
                    <div class="space-y-3">
                        ${users.map(user => `
                            <div class="bg-slate-700 rounded-lg p-4 flex items-center justify-between">
                                <div>
                                    <p class="font-bold text-lg">${user.username}</p>
                                    <p class="text-sm text-slate-400">
                                        ${user.role === 'admin' ? '👑 מנהל' : '👤 נציג'} • 
                                        נוצר: ${new Date(user.created_at).toLocaleDateString('he-IL')}
                                    </p>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="changeUserPassword(${user.id}, '${user.username}')"
                                            class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-sm">
                                        🔑 שנה סיסמה
                                    </button>
                                    ${user.id !== currentUserId ? `
                                        <button onclick="deleteUserConfirm(${user.id}, '${user.username}')"
                                                class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm">
                                            🗑️ מחק
                                        </button>
                                    ` : `
                                        <span class="text-emerald-400 px-4 py-2 text-sm">
                                            אתה 🔒
                                        </span>
                                    `}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <button onclick="closeManageAgents(); showAddAgent();" 
                            class="w-full mt-6 bg-emerald-500 hover:bg-emerald-600 py-3 rounded-lg font-bold">
                        ➕ הוסף נציג נוסף
                    </button>
                `}
                
                <button onclick="closeManageAgents()" 
                        class="w-full mt-3 bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">
                    סגור
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeManageAgents();
        });
        
    } catch (error) {
        console.error('Manage agents error:', error);
        showNotification('❌ שגיאה בטעינת נציגים', 'error');
    }
}

function closeManageAgents() {
    const modal = document.getElementById('manageAgentsModal');
    if (modal) modal.remove();
}

async function changeUserPassword(userId, username) {
    const newPassword = prompt(`🔑 הכנס סיסמה חדשה עבור ${username}:`);
    if (!newPassword) return;
    
    if (newPassword.length < 6) {
        showNotification('❌ הסיסמה חייבת להכיל לפחות 6 תווים', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/users/${userId}/password`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: newPassword })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ סיסמה שונתה עבור ${username}`);
        } else {
            showNotification(`❌ ${data.error || 'שגיאה בשינוי סיסמה'}`, 'error');
        }
    } catch (error) {
        console.error('Change password error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function deleteUserConfirm(userId, username) {
    if (!confirm(`⚠️ האם אתה בטוח שברצונך למחוק את ${username}?`)) return;
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ ${username} נמחק בהצלחה`);
            manageAgents(); // Refresh list
        } else {
            showNotification(`❌ ${data.error || 'שגיאה במחיקת נציג'}`, 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}
