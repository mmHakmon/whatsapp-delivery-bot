// ==========================================
// M.M.H DELIVERY - ADMIN DASHBOARD
// ✅ FIXED VERSION WITH REAL-TIME PRICE CALCULATION!
// ==========================================

let adminToken = localStorage.getItem('adminToken');
let userData = null;
let ws = null;
let currentFilter = 'all';

// Google Maps variables
let autocompletePickup = null;
let autocompleteDelivery = null;
let selectedPickupLocation = null;
let selectedDeliveryLocation = null;
let googleMapsLoaded = false;

// ==========================================
// GOOGLE MAPS API LOADER
// ==========================================

async function loadGoogleMapsAPI() {
    if (googleMapsLoaded) {
        console.log('✅ Google Maps already loaded');
        return Promise.resolve();
    }
    
    try {
        console.log('🗺️ Fetching Google Maps API key...');
        const response = await fetch('/api/config/google-maps-key');
        const data = await response.json();
        
        if (!data.apiKey) {
            throw new Error('Google Maps API key not found');
        }
        
        console.log('🗺️ Loading Google Maps API...');
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&libraries=places&language=he`;
            script.async = true;
            script.defer = true;
            
            script.onload = () => {
                googleMapsLoaded = true;
                console.log('✅ Google Maps API loaded successfully');
                resolve();
            };
            
            script.onerror = () => {
                console.error('❌ Failed to load Google Maps API');
                reject(new Error('Failed to load Google Maps API'));
            };
            
            document.head.appendChild(script);
        });
    } catch (error) {
        console.error('❌ Error loading Google Maps API:', error);
        throw error;
    }
}

// Load Google Maps on page load
document.addEventListener('DOMContentLoaded', () => {
    loadGoogleMapsAPI().catch(err => {
        console.error('Failed to initialize Google Maps:', err);
    });
});

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
        window.location.href = "/";  // ✅ Redirect to home page!
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
    console.log('📨 WebSocket message:', data);
    
    switch (data.type) {
        case 'new_order':
            showNotification('📦 הזמנה חדשה התקבלה!');
            loadOrders(currentFilter === 'all' ? null : currentFilter);
            loadStatistics();
            break;
        case 'order_updated':
            console.log('🔄 Order updated, reloading...');
            loadOrders(currentFilter === 'all' ? null : currentFilter);
            loadStatistics();
            break;
        case 'order_published':
            showNotification('📢 ההזמנה פורסמה!');
            loadOrders(currentFilter === 'all' ? null : currentFilter);
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
        if (!adminToken) {
            console.error('❌ loadStatistics: אין טוקן!');
            return;
        }

        const response = await fetch('/api/admin/dashboard-stats', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const stats = data.statistics;
            
            document.getElementById('statTotalOrders').textContent = stats.total_orders || 0;
            document.getElementById('statActiveOrders').textContent = stats.active_orders || 0;
            document.getElementById('statDelivered').textContent = stats.delivered_orders || 0;
            
            const totalRevenue = parseFloat(stats.total_revenue || 0);
            const commissionRate = 0.25;
            const netProfit = Math.floor(totalRevenue * commissionRate);
            const courierPayout = totalRevenue - netProfit;
            
            document.getElementById('statRevenue').textContent = `₪${totalRevenue.toLocaleString()}`;
            
            const netProfitEl = document.getElementById('statNetProfit');
            if (netProfitEl) {
                netProfitEl.textContent = `₪${netProfit.toLocaleString()}`;
            }
            
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
        
        console.log('📥 Loading orders:', { url, status, currentFilter });
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log(`✅ Loaded ${data.orders?.length || 0} orders`);
            displayOrders(data.orders || []);
        } else {
            console.error('❌ Failed to load orders:', response.status);
            const error = await response.json();
            console.error('Error details:', error);
        }
    } catch (error) {
        console.error('❌ Load orders error:', error);
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
    
    if (!adminToken) {
        showNotification('❌ אין טוקן - התחבר מחדש', 'error');
        logout();
        return;
    }
    
    console.log('📤 Publishing order:', orderId);
    
    try {
        const response = await fetch(`/api/orders/${orderId}/publish`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        console.log('📥 Response status:', response.status);
        
        if (response.status === 401) {
            showNotification('❌ פג תוקף הטוקן - מתנתק...', 'error');
            setTimeout(() => logout(), 2000);
            return;
        }
        
        if (response.ok) {
            showNotification('✅ ההזמנה פורסמה בהצלחה!');
            setTimeout(() => {
                loadOrders(currentFilter === 'all' ? null : currentFilter);
                loadStatistics();
            }, 500);
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
    
    if (!adminToken) {
        showNotification('❌ אין טוקן - התחבר מחדש', 'error');
        logout();
        return;
    }
    
    console.log('📤 Cancelling order:', orderId);
    
    try {
        const response = await fetch(`/api/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                cancelReason: reason || 'ביטול ללא סיבה'
            })
        });
        
        console.log('📥 Response status:', response.status);
        
        if (response.status === 401) {
            showNotification('❌ פג תוקף הטוקן - מתנתק...', 'error');
            setTimeout(() => logout(), 2000);
            return;
        }
        
        if (response.ok) {
            showNotification('✅ ההזמנה בוטלה');
            setTimeout(() => {
                loadOrders(currentFilter === 'all' ? null : currentFilter);
                loadStatistics();
            }, 500);
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Cancel error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
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

// ==========================================
// CREATE ORDER MODAL - ✅ WITH PRICE DISPLAY!
// ==========================================

function showCreateOrderModal() {
    const modal = document.createElement('div');
    modal.id = 'createOrderModal';
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold">📦 הזמנה חדשה</h2>
                <button onclick="closeCreateOrderModal()" class="text-4xl hover:text-red-500">&times;</button>
            </div>
            
            <form id="createOrderForm" onsubmit="handleCreateOrder(event)" class="space-y-4">
                <!-- Sender Details -->
                <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <h3 class="font-bold text-blue-400 mb-3">📤 פרטי שולח</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm mb-1">שם מלא *</label>
                            <input type="text" name="senderName" required
                                   placeholder="שם מלא"
                                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">טלפון *</label>
                            <input type="tel" name="senderPhone" required 
                                   pattern="0[0-9]{9}" 
                                   placeholder="0501234567"
                                   title="הזן מספר טלפון ישראלי תקין (10 ספרות)"
                                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                        </div>
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm mb-1">כתובת איסוף * <span class="text-xs text-slate-400">(התחל להקליד...)</span></label>
                        <input type="text" id="pickupAddress" name="pickupAddress" required
                               placeholder="התחל להקליד כתובת..."
                               autocomplete="off"
                               class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm mb-1">הערות לאיסוף</label>
                        <input type="text" name="pickupNotes"
                               placeholder="קומה, דירה, הערות..."
                               class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                    </div>
                </div>
                
                <!-- Receiver Details -->
                <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <h3 class="font-bold text-emerald-400 mb-3">📥 פרטי מקבל</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm mb-1">שם מלא *</label>
                            <input type="text" name="receiverName" required
                                   placeholder="שם מלא"
                                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                        </div>
                        <div>
                            <label class="block text-sm mb-1">טלפון *</label>
                            <input type="tel" name="receiverPhone" required 
                                   pattern="0[0-9]{9}"
                                   placeholder="0501234567"
                                   title="הזן מספר טלפון ישראלי תקין (10 ספרות)"
                                   class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                        </div>
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm mb-1">כתובת מסירה * <span class="text-xs text-slate-400">(התחל להקליד...)</span></label>
                        <input type="text" id="deliveryAddress" name="deliveryAddress" required
                               placeholder="התחל להקליד כתובת..."
                               autocomplete="off"
                               class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                    </div>
                    <div class="mt-3">
                        <label class="block text-sm mb-1">הערות למסירה</label>
                        <input type="text" name="deliveryNotes"
                               placeholder="קומה, דירה, הערות..."
                               class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm">
                    </div>
                </div>
                
                <!-- Package Details + Price Calc -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold mb-3">📦 פרטי חבילה ומחיר</h3>
                    <div class="mb-3">
                        <label class="block text-sm mb-1">תיאור חבילה</label>
                        <input type="text" name="packageDescription"
                               placeholder="מסמכים, מזון, חבילה קטנה..."
                               class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm">
                    </div>
                    <div class="mb-3">
                        <label class="block text-sm mb-1">סוג רכב *</label>
                        <select name="vehicleType" id="vehicleType" required onchange="calculatePrice()"
                                class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm">
                            <option value="">בחר סוג רכב...</option>
                            <option value="motorcycle">🏍️ אופנוע</option>
                            <option value="bike">🚲 אופניים</option>
                            <option value="scooter">🛴 קטנוע</option>
                            <option value="car">🚗 רכב פרטי</option>
                            <option value="van">🚐 מסחרית</option>
                            <option value="truck">🚚 משאית</option>
                        </select>
                    </div>
                    
                    <!-- ✅ PRICE DISPLAY - SHOWS IN REAL-TIME! -->
                    <div id="priceDisplay" class="bg-slate-800 rounded-lg p-4 border border-slate-600 hidden">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-sm text-slate-400">מרחק משוער:</span>
                            <span id="distanceDisplay" class="font-bold">-- ק"מ</span>
                        </div>
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-sm text-slate-400">מחיר בסיס:</span>
                            <span id="basePriceDisplay" class="font-bold">₪--</span>
                        </div>
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-sm text-slate-400">מע"מ (18%):</span>
                            <span id="vatDisplay" class="font-bold">₪--</span>
                        </div>
                        <div class="h-px bg-slate-600 my-2"></div>
                        <div class="flex justify-between items-center">
                            <span class="font-bold text-lg">מחיר סופי:</span>
                            <span id="totalPriceDisplay" class="font-bold text-2xl text-emerald-400">₪--</span>
                        </div>
                    </div>
                    
                    <div class="mt-3">
                        <label class="block text-sm mb-1">הערות כלליות</label>
                        <textarea name="notes" rows="2"
                                  placeholder="הערות נוספות..."
                                  class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-sm"></textarea>
                    </div>
                </div>
                
                <div class="flex gap-3 pt-4">
                    <button type="submit" id="submitBtn" class="flex-1 bg-emerald-500 hover:bg-emerald-600 font-bold py-3 rounded-lg">
                        ✅ צור הזמנה
                    </button>
                    <button type="button" onclick="closeCreateOrderModal()" 
                            class="flex-1 bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded-lg">
                        ביטול
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Wait for Google Maps to load before initializing autocomplete
    if (googleMapsLoaded) {
        setTimeout(() => {
            initGooglePlacesAutocomplete();
        }, 100);
    } else {
        loadGoogleMapsAPI()
            .then(() => {
                setTimeout(() => {
                    initGooglePlacesAutocomplete();
                }, 100);
            })
            .catch(err => {
                console.error('Failed to load Google Maps:', err);
                showNotification('❌ שגיאה בטעינת Google Maps', 'error');
            });
    }
}

function closeCreateOrderModal() {
    const modal = document.getElementById('createOrderModal');
    if (modal) modal.remove();
    
    autocompletePickup = null;
    autocompleteDelivery = null;
    selectedPickupLocation = null;
    selectedDeliveryLocation = null;
}

function initGooglePlacesAutocomplete() {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        console.error('❌ Google Maps Places API not loaded!');
        showNotification('❌ Google Maps לא נטען - נסה שוב', 'error');
        return;
    }
    
    const pickupInput = document.getElementById('pickupAddress');
    const deliveryInput = document.getElementById('deliveryAddress');
    
    if (!pickupInput || !deliveryInput) {
        console.error('❌ Address inputs not found');
        return;
    }
    
    const options = {
        componentRestrictions: { country: 'il' },
        fields: ['formatted_address', 'geometry', 'name'],
        types: ['address']
    };
    
    console.log('🗺️ Initializing Google Places Autocomplete...');
    
    try {
        autocompletePickup = new google.maps.places.Autocomplete(pickupInput, options);
        autocompletePickup.addListener('place_changed', () => {
            const place = autocompletePickup.getPlace();
            if (place.geometry) {
                selectedPickupLocation = {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    address: place.formatted_address || place.name
                };
                console.log('✅ Pickup location selected:', selectedPickupLocation);
                calculatePrice(); // ✅ Calculate price when pickup changes
            }
        });
    } catch (error) {
        console.error('❌ Error initializing pickup autocomplete:', error);
    }
    
    try {
        autocompleteDelivery = new google.maps.places.Autocomplete(deliveryInput, options);
        autocompleteDelivery.addListener('place_changed', () => {
            const place = autocompleteDelivery.getPlace();
            if (place.geometry) {
                selectedDeliveryLocation = {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                    address: place.formatted_address || place.name
                };
                console.log('✅ Delivery location selected:', selectedDeliveryLocation);
                calculatePrice(); // ✅ Calculate price when delivery changes
            }
        });
    } catch (error) {
        console.error('❌ Error initializing delivery autocomplete:', error);
    }
    
    console.log('✅ Google Places Autocomplete initialized successfully');
}

// ==========================================
// ✅ CALCULATE PRICE IN REAL-TIME!
// ==========================================

async function calculatePrice() {
    const vehicleType = document.getElementById('vehicleType')?.value;
    
    if (!selectedPickupLocation || !selectedDeliveryLocation) {
        console.log('⏳ Waiting for both locations...');
        return;
    }
    
    if (!vehicleType) {
        console.log('⏳ Waiting for vehicle type...');
        return;
    }
    
    console.log('🧮 Calculating price...', {
        pickup: selectedPickupLocation,
        delivery: selectedDeliveryLocation,
        vehicle: vehicleType
    });
    
    try {
        const response = await fetch('/api/orders/calculate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pickupLat: selectedPickupLocation.lat,
                pickupLng: selectedPickupLocation.lng,
                deliveryLat: selectedDeliveryLocation.lat,
                deliveryLng: selectedDeliveryLocation.lng,
                vehicleType: vehicleType
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            displayPrice(data);
        } else {
            const error = await response.json();
            console.error('❌ Price calc error:', error);
            showNotification('❌ שגיאה בחישוב מחיר', 'error');
        }
    } catch (error) {
        console.error('❌ Price calc exception:', error);
        showNotification('❌ שגיאה בחישוב מחיר', 'error');
    }
}

function displayPrice(data) {
    const priceDisplay = document.getElementById('priceDisplay');
    const distanceDisplay = document.getElementById('distanceDisplay');
    const basePriceDisplay = document.getElementById('basePriceDisplay');
    const vatDisplay = document.getElementById('vatDisplay');
    const totalPriceDisplay = document.getElementById('totalPriceDisplay');
    
    if (priceDisplay && distanceDisplay && basePriceDisplay && vatDisplay && totalPriceDisplay) {
        priceDisplay.classList.remove('hidden');
        distanceDisplay.textContent = `${data.distanceKm} ק"מ`;
        basePriceDisplay.textContent = `₪${data.basePrice}`;
        vatDisplay.textContent = `₪${data.vat}`;
        totalPriceDisplay.textContent = `₪${data.totalPrice}`;
        
        console.log('✅ Price displayed:', data);
    } else {
        console.error('❌ Price display elements not found');
    }
}

// ✅ FIXED: handleCreateOrder now properly loads orders with current filter!
async function handleCreateOrder(event) {
    event.preventDefault();
    
    if (!adminToken) {
        showNotification('❌ אין טוקן - התחבר מחדש', 'error');
        logout();
        return;
    }

    const formData = new FormData(event.target);
    
    if (!selectedPickupLocation || !selectedDeliveryLocation) {
        showNotification('❌ יש לבחור כתובות מהרשימה המוצעת', 'error');
        return;
    }
    
    const vehicleType = formData.get('vehicleType');
    if (!vehicleType) {
        showNotification('❌ יש לבחור סוג רכב', 'error');
        return;
    }
    
    const data = {
        senderName: formData.get('senderName'),
        senderPhone: formData.get('senderPhone'),
        pickupAddress: selectedPickupLocation.address,
        pickupLat: selectedPickupLocation.lat,
        pickupLng: selectedPickupLocation.lng,
        pickupNotes: formData.get('pickupNotes') || '',
        receiverName: formData.get('receiverName'),
        receiverPhone: formData.get('receiverPhone'),
        deliveryAddress: selectedDeliveryLocation.address,
        deliveryLat: selectedDeliveryLocation.lat,
        deliveryLng: selectedDeliveryLocation.lng,
        deliveryNotes: formData.get('deliveryNotes') || '',
        packageDescription: formData.get('packageDescription') || '',
        vehicleType: vehicleType,
        notes: formData.get('notes') || '',
        priority: 'normal'
    };

    console.log('📤 Sending order:', data);
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ שולח...';
    
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(`✅ הזמנה ${result.order.order_number} נוצרה!`);
            closeCreateOrderModal();
            
            // ✅ CRITICAL FIX: Load orders with proper filter!
            setTimeout(() => {
                loadOrders(currentFilter === 'all' ? null : currentFilter);
                loadStatistics();
            }, 300);
        } else {
            showNotification('❌ ' + (result.error || 'שגיאה ביצירת הזמנה'), 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = '✅ צור הזמנה';
        }
    } catch (error) {
        console.error('Create order error:', error);
        showNotification('❌ שגיאת תקשורת: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '✅ צור הזמנה';
    }
}

// ==========================================
// FILTERS
// ==========================================

function filterOrders(status) {
    currentFilter = status;
    
    console.log('🔍 Filtering orders by:', status);
    
    // Update all filter buttons
    document.querySelectorAll('.filter-btn, .filter-btn-active').forEach(btn => {
        btn.className = 'filter-btn px-4 py-2 rounded-lg';
    });
    
    // Highlight active button
    const btnId = 'filter' + status.charAt(0).toUpperCase() + status.slice(1);
    const activeBtn = document.getElementById(btnId);
    if (activeBtn) {
        activeBtn.className = 'filter-btn-active px-4 py-2 rounded-lg';
    }
    
    // Load orders with filter
    loadOrders(status === 'all' ? null : status);
}

// ==========================================
// TABS
// ==========================================

function switchTab(tab) {
    document.querySelectorAll('[id^="tab"]').forEach(t => t.className = 'tab-inactive px-6 py-3');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).className = 'tab-active px-6 py-3 font-bold';
    document.getElementById(`${tab}Tab`).classList.remove('hidden');
    
    if (tab === 'orders') loadOrders();
    if (tab === 'couriers') loadCouriers();
    if (tab === 'payments') loadPayments();
}

// ==========================================
// COURIERS - Placeholder functions
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
            <p class="font-bold">${courier.first_name} ${courier.last_name}</p>
            <p class="text-sm text-slate-400">📞 ${courier.phone}</p>
        </div>
    `).join('');
}

// ==========================================
// PAYMENTS - Placeholder functions
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
            <p class="font-bold">${req.courier_name}</p>
            <p class="text-emerald-400">₪${req.amount}</p>
        </div>
    `).join('');
}

// ==========================================
// SETTINGS & USER MANAGEMENT - Placeholder
// ==========================================

function showSettings() {
    showNotification('הגדרות - בפיתוח', 'info');
}

// ==========================================
// HELPERS
// ==========================================

function getVehicleNameHebrew(type) {
    const names = {
        'motorcycle': 'אופנוע',
        'bike': 'אופניים',
        'scooter': 'קטנוע',
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
