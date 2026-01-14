// ==========================================
// M.M.H DELIVERY - ADMIN DASHBOARD
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
        window.location.href = "/";
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
            const netProfit = totalRevenue * commissionRate;
            const courierPayout = totalRevenue - netProfit;
            
            document.getElementById('statRevenue').textContent = `₪${totalRevenue.toFixed(0)}`;
            document.getElementById('statNetProfit').textContent = `₪${netProfit.toFixed(0)}`;
            document.getElementById('statCourierPayout').textContent = `₪${courierPayout.toFixed(0)}`;
        }
    } catch (error) {
        console.error('Load statistics error:', error);
    }
}

// ==========================================
// TABS
// ==========================================

function switchTab(tab) {
    ['orders', 'couriers', 'payments'].forEach(t => {
        document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.remove('tab-active');
        document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`).classList.add('tab-inactive');
        document.getElementById(`${t}Tab`).classList.add('hidden');
    });
    
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('tab-active');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove('tab-inactive');
    document.getElementById(`${tab}Tab`).classList.remove('hidden');
    
    if (tab === 'orders') {
        loadOrders();
    } else if (tab === 'couriers') {
        loadCouriers();
    } else if (tab === 'payments') {
        loadPayments();
    }
}

// ==========================================
// ORDERS
// ==========================================

async function loadOrders(status = null) {
    try {
        let url = '/api/orders';
        if (status) {
            url += `?status=${status}`;
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
    
    if (orders.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 py-8">אין הזמנות</p>';
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <span class="text-lg font-bold">${order.order_number}</span>
                    <span class="mr-2">${getStatusBadge(order.status)}</span>
                </div>
                <span class="text-emerald-400 font-bold text-xl">₪${order.price}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-sm mb-3">
                <div>
                    <p class="text-slate-400">שולח</p>
                    <p class="font-bold">${order.sender_name}</p>
                    <p>${order.sender_phone}</p>
                </div>
                <div>
                    <p class="text-slate-400">מקבל</p>
                    <p class="font-bold">${order.receiver_name}</p>
                    <p>${order.receiver_phone}</p>
                </div>
            </div>
            <div class="text-sm space-y-1 mb-3">
                <p>📍 מ: ${order.pickup_address}</p>
                <p>🏠 ל: ${order.delivery_address}</p>
                <p>🏍️ ${getVehicleNameHebrew(order.vehicle_type)} | 📏 ${order.distance_km} ק"מ</p>
            </div>
            ${order.courier_first_name ? `
                <div class="bg-slate-600 rounded p-2 text-sm mb-3">
                    🚚 שליח: ${order.courier_first_name} ${order.courier_last_name} | ${order.courier_phone}
                </div>
            ` : ''}
            <div class="flex gap-2">
                ${order.status === 'new' ? `
                    <button onclick="publishOrder(${order.id})" 
                            class="flex-1 bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-sm">
                        📢 פרסם
                    </button>
                ` : ''}
                <button onclick="viewOrderDetails(${order.id})" 
                        class="flex-1 bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded text-sm">
                    👁️ פרטים
                </button>
                <button onclick="deleteOrderConfirm(${order.id}, '${order.order_number}')" 
                        class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

function getStatusBadge(status) {
    const badges = {
        'new': '<span class="bg-blue-500 px-2 py-1 rounded text-xs">🆕 חדש</span>',
        'published': '<span class="bg-purple-500 px-2 py-1 rounded text-xs">📢 מפורסם</span>',
        'taken': '<span class="bg-yellow-500 px-2 py-1 rounded text-xs">🔵 נתפס</span>',
        'picked': '<span class="bg-orange-500 px-2 py-1 rounded text-xs">📦 נאסף</span>',
        'delivered': '<span class="bg-emerald-500 px-2 py-1 rounded text-xs">✅ נמסר</span>',
        'cancelled': '<span class="bg-red-500 px-2 py-1 rounded text-xs">❌ בוטל</span>'
    };
    return badges[status] || status;
}

function filterOrders(status) {
    currentFilter = status;
    
    // Update button styles
    ['all', 'new', 'published', 'taken', 'delivered'].forEach(s => {
        const btn = document.getElementById(`filter${s.charAt(0).toUpperCase() + s.slice(1)}`);
        if (btn) {
            btn.classList.remove('filter-btn-active');
            btn.classList.add('filter-btn');
        }
    });
    
    const activeBtn = document.getElementById(`filter${status.charAt(0).toUpperCase() + status.slice(1)}`);
    if (activeBtn) {
        activeBtn.classList.add('filter-btn-active');
        activeBtn.classList.remove('filter-btn');
    }
    
    loadOrders(status === 'all' ? null : status);
}

// ==========================================
// CREATE ORDER MODAL - ✅ הפונקציה החדשה!
// ==========================================

async function showCreateOrderModal() {
    // טען את Google Maps אם עדיין לא נטען
    if (!googleMapsLoaded) {
        await loadGoogleMapsAPI();
    }
    
    const modal = document.createElement('div');
    modal.id = 'createOrderModal';
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
    modal.style.overflowY = 'auto';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-3xl border border-slate-700 my-8" style="max-height: 90vh; overflow-y: auto;">
            <div class="flex justify-between items-center mb-6 sticky top-0 bg-slate-800 z-10 pb-4">
                <h2 class="text-2xl font-bold">📦 יצירת הזמנה חדשה</h2>
                <button onclick="closeCreateOrderModal()" class="text-3xl hover:text-red-500">✕</button>
            </div>
            
            <form id="createOrderForm" onsubmit="submitNewOrder(event)" class="space-y-4">
                <!-- פרטי שולח -->
                <div class="bg-slate-700/50 rounded-lg p-4">
                    <h3 class="font-bold mb-3 text-emerald-400">📤 פרטי שולח</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm mb-2">שם שולח *</label>
                            <input type="text" id="senderName" required
                                   class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                        </div>
                        <div>
                            <label class="block text-sm mb-2">טלפון *</label>
                            <input type="tel" id="senderPhone" required pattern="[0-9]{10}"
                                   placeholder="0501234567"
                                   class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm mb-2">כתובת איסוף * (התחל להקליד ובחר מהרשימה)</label>
                            <input type="text" id="pickupAddress" required
                                   placeholder="רחוב 1, תל אביב"
                                   class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                            <input type="hidden" id="pickupLat">
                            <input type="hidden" id="pickupLng">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm mb-2">הערות לאיסוף</label>
                            <textarea id="pickupNotes" rows="2"
                                      class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"></textarea>
                        </div>
                    </div>
                </div>

                <!-- פרטי מקבל -->
                <div class="bg-slate-700/50 rounded-lg p-4">
                    <h3 class="font-bold mb-3 text-blue-400">📥 פרטי מקבל</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm mb-2">שם מקבל *</label>
                            <input type="text" id="receiverName" required
                                   class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                        </div>
                        <div>
                            <label class="block text-sm mb-2">טלפון *</label>
                            <input type="tel" id="receiverPhone" required pattern="[0-9]{10}"
                                   placeholder="0501234567"
                                   class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm mb-2">כתובת מסירה * (התחל להקליד ובחר מהרשימה)</label>
                            <input type="text" id="deliveryAddress" required
                                   placeholder="רחוב 2, ירושלים"
                                   class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                            <input type="hidden" id="deliveryLat">
                            <input type="hidden" id="deliveryLng">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm mb-2">הערות למסירה</label>
                            <textarea id="deliveryNotes" rows="2"
                                      class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"></textarea>
                        </div>
                    </div>
                </div>

                <!-- פרטי משלוח -->
                <div class="bg-slate-700/50 rounded-lg p-4">
                    <h3 class="font-bold mb-3 text-purple-400">📦 פרטי משלוח</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm mb-2">סוג רכב *</label>
                            <select id="vehicleType" required
                                    onchange="calculatePrice()"
                                    class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                                <option value="motorcycle">🏍️ אופנוע</option>
                                <option value="car">🚗 רכב פרטי</option>
                                <option value="van">🚐 מסחרית</option>
                                <option value="truck">🚚 משאית</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm mb-2">עדיפות</label>
                            <select id="priority"
                                    class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                                <option value="normal">רגיל</option>
                                <option value="express">מהיר</option>
                                <option value="urgent">דחוף</option>
                            </select>
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm mb-2">תיאור חבילה</label>
                            <input type="text" id="packageDescription"
                                   placeholder="מסמכים, חבילה קטנה, וכו'..."
                                   class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-sm mb-2">הערות כלליות</label>
                            <textarea id="orderNotes" rows="2"
                                      class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3"></textarea>
                        </div>
                    </div>
                </div>

                <!-- מחיר משוער -->
                <div id="pricingDisplay" class="hidden bg-gradient-to-r from-emerald-600 to-blue-600 rounded-lg p-4">
                    <div class="space-y-3">
                        <div class="flex justify-between items-center">
                            <div>
                                <p class="text-sm opacity-80">מחיר מחושב</p>
                                <p class="text-3xl font-bold" id="estimatedPrice">₪0</p>
                            </div>
                            <div class="text-right">
                                <p class="text-sm opacity-80">מרחק</p>
                                <p class="text-xl font-bold" id="estimatedDistance">0 ק"מ</p>
                            </div>
                            <div class="text-right">
                                <p class="text-sm opacity-80">לשליח</p>
                                <p class="text-xl font-bold" id="courierPayout">₪0</p>
                            </div>
                        </div>
                        
                        <!-- ✅ עריכת מחיר ידנית -->
                        <div class="border-t border-white/20 pt-3">
                            <label class="flex items-center gap-2 mb-2">
                                <input type="checkbox" id="manualPriceToggle" onchange="toggleManualPrice()" class="w-4 h-4">
                                <span class="text-sm">ערוך מחיר ידנית</span>
                            </label>
                            <div id="manualPriceInput" class="hidden">
                                <div class="flex gap-2 items-center">
                                    <input type="number" id="manualPrice" min="0" step="1" placeholder="הכנס מחיר"
                                           class="flex-1 bg-white/20 border border-white/30 rounded-lg px-4 py-2 text-white">
                                    <span class="text-sm opacity-80">₪</span>
                                </div>
                                <p class="text-xs opacity-70 mt-1">* המחיר היד ני יעקוף את החישוב האוטומטי</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- כפתורי שליחה -->
                <div class="flex gap-3">
                    <button type="button" onclick="closeCreateOrderModal()"
                            class="flex-1 bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">
                        ביטול
                    </button>
                    <button type="submit"
                            class="flex-1 bg-emerald-500 hover:bg-emerald-600 py-3 rounded-lg font-bold">
                        ✅ צור הזמנה
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize Google Places Autocomplete
    setTimeout(() => {
        initializeAutocomplete();
    }, 100);
}

function closeCreateOrderModal() {
    const modal = document.getElementById('createOrderModal');
    if (modal) modal.remove();
    
    // Reset autocomplete
    selectedPickupLocation = null;
    selectedDeliveryLocation = null;
    autocompletePickup = null;
    autocompleteDelivery = null;
}

// ==========================================
// GOOGLE PLACES AUTOCOMPLETE
// ==========================================

function initializeAutocomplete() {
    if (!window.google || !window.google.maps) {
        console.error('❌ Google Maps לא נטען');
        showNotification('❌ שגיאה בטעינת מפות', 'error');
        return;
    }
    
    const pickupInput = document.getElementById('pickupAddress');
    const deliveryInput = document.getElementById('deliveryAddress');
    
    if (!pickupInput || !deliveryInput) {
        console.error('❌ שדות כתובת לא נמצאו');
        return;
    }
    
    // Autocomplete options - מוגבל לישראל
    const options = {
        componentRestrictions: { country: 'il' },
        fields: ['geometry', 'formatted_address', 'name']
    };
    
    // Pickup autocomplete
    autocompletePickup = new google.maps.places.Autocomplete(pickupInput, options);
    autocompletePickup.addListener('place_changed', () => {
        const place = autocompletePickup.getPlace();
        if (place.geometry) {
            selectedPickupLocation = {
                address: place.formatted_address || place.name,
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
            };
            document.getElementById('pickupLat').value = selectedPickupLocation.lat;
            document.getElementById('pickupLng').value = selectedPickupLocation.lng;
            console.log('✅ בחרת כתובת איסוף:', selectedPickupLocation);
            calculatePrice();
        }
    });
    
    // Delivery autocomplete
    autocompleteDelivery = new google.maps.places.Autocomplete(deliveryInput, options);
    autocompleteDelivery.addListener('place_changed', () => {
        const place = autocompleteDelivery.getPlace();
        if (place.geometry) {
            selectedDeliveryLocation = {
                address: place.formatted_address || place.name,
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
            };
            document.getElementById('deliveryLat').value = selectedDeliveryLocation.lat;
            document.getElementById('deliveryLng').value = selectedDeliveryLocation.lng;
            console.log('✅ בחרת כתובת מסירה:', selectedDeliveryLocation);
            calculatePrice();
        }
    });
    
    console.log('✅ Autocomplete initialized');
}

// ==========================================
// TOGGLE MANUAL PRICE
// ==========================================

function toggleManualPrice() {
    const toggle = document.getElementById('manualPriceToggle');
    const manualInput = document.getElementById('manualPriceInput');
    
    if (toggle.checked) {
        manualInput.classList.remove('hidden');
        // מילוי אוטומטי של המחיר המחושב
        const estimatedPrice = document.getElementById('estimatedPrice').textContent.replace('₪', '');
        document.getElementById('manualPrice').value = estimatedPrice;
    } else {
        manualInput.classList.add('hidden');
        document.getElementById('manualPrice').value = '';
    }
}

// ==========================================
// CALCULATE PRICING
// ==========================================

async function calculatePrice() {
    const pickupLat = document.getElementById('pickupLat').value;
    const pickupLng = document.getElementById('pickupLng').value;
    const deliveryLat = document.getElementById('deliveryLat').value;
    const deliveryLng = document.getElementById('deliveryLng').value;
    const vehicleType = document.getElementById('vehicleType').value;
    
    if (!pickupLat || !pickupLng || !deliveryLat || !deliveryLng) {
        console.log('⚠️ חסרים נתוני מיקום');
        return;
    }
    
    try {
        const response = await fetch('/api/orders/calculate', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({
                pickupLat: parseFloat(pickupLat),
                pickupLng: parseFloat(pickupLng),
                deliveryLat: parseFloat(deliveryLat),
                deliveryLng: parseFloat(deliveryLng),
                vehicleType
            })
        });
        
        if (response.ok) {
            const pricing = await response.json();
            console.log('💰 Pricing:', pricing);
            
            // הצג מחיר
            document.getElementById('estimatedPrice').textContent = `₪${pricing.totalPrice}`;
            document.getElementById('estimatedDistance').textContent = `${pricing.distanceKm} ק"מ`;
            document.getElementById('courierPayout').textContent = `₪${pricing.courierPayout}`;
            document.getElementById('pricingDisplay').classList.remove('hidden');
        } else {
            console.error('❌ שגיאה בחישוב מחיר');
        }
    } catch (error) {
        console.error('❌ Calculate price error:', error);
    }
}

// ==========================================
// SUBMIT NEW ORDER
// ==========================================

async function submitNewOrder(event) {
    event.preventDefault();
    
    const pickupLat = document.getElementById('pickupLat').value;
    const pickupLng = document.getElementById('pickupLng').value;
    const deliveryLat = document.getElementById('deliveryLat').value;
    const deliveryLng = document.getElementById('deliveryLng').value;
    
    if (!pickupLat || !pickupLng) {
        showNotification('❌ נא לבחור כתובת איסוף מהרשימה', 'error');
        return;
    }
    
    if (!deliveryLat || !deliveryLng) {
        showNotification('❌ נא לבחור כתובת מסירה מהרשימה', 'error');
        return;
    }
    
    // ✅ בדוק אם יש מחיר ידני
    const manualPriceToggle = document.getElementById('manualPriceToggle');
    const manualPrice = document.getElementById('manualPrice').value;
    
    const orderData = {
        senderName: document.getElementById('senderName').value,
        senderPhone: document.getElementById('senderPhone').value,
        pickupAddress: document.getElementById('pickupAddress').value,
        pickupLat: parseFloat(pickupLat),
        pickupLng: parseFloat(pickupLng),
        pickupNotes: document.getElementById('pickupNotes').value,
        receiverName: document.getElementById('receiverName').value,
        receiverPhone: document.getElementById('receiverPhone').value,
        deliveryAddress: document.getElementById('deliveryAddress').value,
        deliveryLat: parseFloat(deliveryLat),
        deliveryLng: parseFloat(deliveryLng),
        deliveryNotes: document.getElementById('deliveryNotes').value,
        packageDescription: document.getElementById('packageDescription').value,
        notes: document.getElementById('orderNotes').value,
        vehicleType: document.getElementById('vehicleType').value,
        priority: document.getElementById('priority').value
    };
    
    // ✅ אם יש מחיר ידני - הוסף אותו
    if (manualPriceToggle.checked && manualPrice) {
        orderData.manualPrice = parseFloat(manualPrice);
    }
    
    console.log('📦 Creating order:', orderData);
    
    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(orderData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('✅ ההזמנה נוצרה בהצלחה!');
            closeCreateOrderModal();
            loadOrders();
            loadStatistics();
        } else {
            showNotification(`❌ ${data.error || 'שגיאה ביצירת הזמנה'}`, 'error');
        }
    } catch (error) {
        console.error('Create order error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

// ==========================================
// ORDER ACTIONS
// ==========================================

async function publishOrder(orderId) {
    if (!confirm('האם לפרסם את ההזמנה לשליחים?')) return;
    
    try {
        const response = await fetch(`/api/orders/${orderId}/publish`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('✅ ההזמנה פורסמה בהצלחה!');
            loadOrders(currentFilter === 'all' ? null : currentFilter);
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Publish order error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function deleteOrderConfirm(orderId, orderNumber) {
    if (!confirm(`האם למחוק את ההזמנה ${orderNumber}?`)) return;
    
    try {
        const response = await fetch(`/api/admin/orders/${orderId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('✅ ההזמנה נמחקה');
            loadOrders(currentFilter === 'all' ? null : currentFilter);
            loadStatistics();
        } else {
            showNotification(`❌ ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Delete order error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function viewOrderDetails(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const order = data.order;
            
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
            modal.innerHTML = `
                <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-2xl border border-slate-700 overflow-y-auto" style="max-height: 90vh;">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold">פרטי הזמנה #${order.order_number}</h2>
                        <button onclick="this.closest('.fixed').remove()" class="text-3xl hover:text-red-500">✕</button>
                    </div>
                    
                    <div class="space-y-4">
                        <div class="bg-slate-700 rounded-lg p-4">
                            <h3 class="font-bold mb-2 text-emerald-400">📤 שולח</h3>
                            <p>שם: ${order.sender_name}</p>
                            <p>טלפון: ${order.sender_phone}</p>
                            <p>כתובת: ${order.pickup_address}</p>
                            ${order.pickup_notes ? `<p>הערות: ${order.pickup_notes}</p>` : ''}
                        </div>
                        
                        <div class="bg-slate-700 rounded-lg p-4">
                            <h3 class="font-bold mb-2 text-blue-400">📥 מקבל</h3>
                            <p>שם: ${order.receiver_name}</p>
                            <p>טלפון: ${order.receiver_phone}</p>
                            <p>כתובת: ${order.delivery_address}</p>
                            ${order.delivery_notes ? `<p>הערות: ${order.delivery_notes}</p>` : ''}
                        </div>
                        
                        <div class="bg-slate-700 rounded-lg p-4">
                            <h3 class="font-bold mb-2 text-purple-400">📦 פרטי משלוח</h3>
                            <p>סטטוס: ${getStatusBadge(order.status)}</p>
                            <p>רכב: ${getVehicleNameHebrew(order.vehicle_type)}</p>
                            <p>מרחק: ${order.distance_km} ק"מ</p>
                            <p>מחיר: ₪${order.price}</p>
                            <p>לשליח: ₪${order.courier_payout}</p>
                            ${order.package_description ? `<p>תיאור: ${order.package_description}</p>` : ''}
                            ${order.notes ? `<p>הערות: ${order.notes}</p>` : ''}
                        </div>
                        
                        ${order.courier_first_name ? `
                            <div class="bg-slate-700 rounded-lg p-4">
                                <h3 class="font-bold mb-2 text-yellow-400">🚚 שליח</h3>
                                <p>${order.courier_first_name} ${order.courier_last_name}</p>
                                <p>${order.courier_phone}</p>
                            </div>
                        ` : ''}
                        
                        <div class="bg-slate-700 rounded-lg p-4 text-sm text-slate-400">
                            <p>נוצר: ${new Date(order.created_at).toLocaleString('he-IL')}</p>
                            ${order.published_at ? `<p>פורסם: ${new Date(order.published_at).toLocaleString('he-IL')}</p>` : ''}
                            ${order.taken_at ? `<p>נתפס: ${new Date(order.taken_at).toLocaleString('he-IL')}</p>` : ''}
                            ${order.picked_at ? `<p>נאסף: ${new Date(order.picked_at).toLocaleString('he-IL')}</p>` : ''}
                            ${order.delivered_at ? `<p>נמסר: ${new Date(order.delivered_at).toLocaleString('he-IL')}</p>` : ''}
                        </div>
                    </div>
                    
                    <button onclick="this.closest('.fixed').remove()" 
                            class="w-full mt-6 bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">
                        סגור
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }
    } catch (error) {
        console.error('View order error:', error);
        showNotification('❌ שגיאה בטעינת פרטי הזמנה', 'error');
    }
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
    
    if (couriers.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 py-8">אין שליחים</p>';
        return;
    }
    
    container.innerHTML = couriers.map(courier => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <span class="text-lg font-bold">${courier.first_name} ${courier.last_name}</span>
                    <span class="mr-2">${getCourierStatusBadge(courier.status)}</span>
                    ${courier.is_online ? '<span class="bg-green-500 px-2 py-1 rounded text-xs">🟢 מחובר</span>' : ''}
                </div>
                <div class="text-right">
                    <p class="text-sm text-slate-400">⭐ ${courier.rating || 5.0}</p>
                    <p class="text-emerald-400 font-bold">₪${courier.balance || 0}</p>
                </div>
            </div>
            <div class="text-sm space-y-1 mb-3">
                <p>📞 ${courier.phone}</p>
                <p>🏍️ ${getVehicleNameHebrew(courier.vehicle_type)}</p>
                <p>📦 ${courier.total_deliveries || 0} משלוחים | 💰 ₪${courier.total_earned || 0} הרוויח</p>
                ${courier.work_area ? `<p>📍 ${getWorkAreaName(courier.work_area)}</p>` : ''}
            </div>
            <div class="flex gap-2">
                <button onclick="viewCourierDetails(${courier.id})" 
                        class="flex-1 bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded text-sm">
                    👁️ פרטים
                </button>
                ${courier.status === 'active' ? `
                    <button onclick="toggleCourierStatus(${courier.id}, 'blocked')" 
                            class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm">
                        🚫 חסום
                    </button>
                ` : `
                    <button onclick="toggleCourierStatus(${courier.id}, 'active')" 
                            class="bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded text-sm">
                        ✅ אפשר
                    </button>
                `}
            </div>
        </div>
    `).join('');
}

function getCourierStatusBadge(status) {
    const badges = {
        'active': '<span class="bg-emerald-500 px-2 py-1 rounded text-xs">✅ פעיל</span>',
        'inactive': '<span class="bg-slate-500 px-2 py-1 rounded text-xs">⭕ לא פעיל</span>',
        'blocked': '<span class="bg-red-500 px-2 py-1 rounded text-xs">🚫 חסום</span>'
    };
    return badges[status] || status;
}

function getWorkAreaName(area) {
    const areas = {
        'center': 'מרכז',
        'north': 'צפון',
        'south': 'דרום',
        'jerusalem': 'ירושלים'
    };
    return areas[area] || area;
}

async function toggleCourierStatus(courierId, newStatus) {
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
            showNotification('✅ סטטוס עודכן');
            loadCouriers();
        }
    } catch (error) {
        console.error('Toggle courier status error:', error);
        showNotification('❌ שגיאה בעדכון סטטוס', 'error');
    }
}

async function viewCourierDetails(courierId) {
    try {
        const response = await fetch(`/api/couriers/${courierId}`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const courier = data.courier;
            
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
            modal.innerHTML = `
                <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-2xl border border-slate-700">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold">פרטי שליח</h2>
                        <button onclick="this.closest('.fixed').remove()" class="text-3xl hover:text-red-500">✕</button>
                    </div>
                    
                    <div class="space-y-4">
                        <div class="bg-slate-700 rounded-lg p-4">
                            <h3 class="font-bold mb-2">פרטים אישיים</h3>
                            <p>שם: ${courier.first_name} ${courier.last_name}</p>
                            <p>ת.ז: ${courier.id_number}</p>
                            <p>טלפון: ${courier.phone}</p>
                            ${courier.email ? `<p>אימייל: ${courier.email}</p>` : ''}
                            ${courier.age ? `<p>גיל: ${courier.age}</p>` : ''}
                            ${courier.gender ? `<p>מגדר: ${courier.gender === 'male' ? 'זכר' : 'נקבה'}</p>` : ''}
                        </div>
                        
                        <div class="bg-slate-700 rounded-lg p-4">
                            <h3 class="font-bold mb-2">פרטי רכב</h3>
                            <p>סוג: ${getVehicleNameHebrew(courier.vehicle_type)}</p>
                            ${courier.vehicle_plate ? `<p>מספר רכב: ${courier.vehicle_plate}</p>` : ''}
                            ${courier.work_area ? `<p>אזור: ${getWorkAreaName(courier.work_area)}</p>` : ''}
                        </div>
                        
                        <div class="bg-slate-700 rounded-lg p-4">
                            <h3 class="font-bold mb-2">סטטיסטיקות</h3>
                            <p>סטטוס: ${getCourierStatusBadge(courier.status)}</p>
                            <p>דירוג: ⭐ ${courier.rating || 5.0}</p>
                            <p>משלוחים: ${courier.total_deliveries || 0}</p>
                            <p>סה"כ הרוויח: ₪${courier.total_earned || 0}</p>
                            <p>יתרה נוכחית: ₪${courier.balance || 0}</p>
                        </div>
                        
                        <div class="bg-slate-700 rounded-lg p-4 text-sm text-slate-400">
                            <p>נוצר: ${new Date(courier.created_at).toLocaleString('he-IL')}</p>
                        </div>
                    </div>
                    
                    <button onclick="this.closest('.fixed').remove()" 
                            class="w-full mt-6 bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">
                        סגור
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
        }
    } catch (error) {
        console.error('View courier error:', error);
        showNotification('❌ שגיאה בטעינת פרטי שליח', 'error');
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
    
    if (requests.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 py-8">אין בקשות משיכה</p>';
        return;
    }
    
    container.innerHTML = requests.map(req => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <span class="text-lg font-bold">${req.courier_name}</span>
                    <span class="mr-2">${getPaymentStatusBadge(req.status)}</span>
                </div>
                <span class="text-emerald-400 font-bold text-xl">₪${req.amount}</span>
            </div>
            <div class="text-sm space-y-1 mb-3">
                <p>📞 ${req.courier_phone}</p>
                <p>💳 ${getPaymentMethodName(req.payment_method)}</p>
                <p>📅 ${new Date(req.created_at).toLocaleString('he-IL')}</p>
                ${req.admin_notes ? `<p class="text-yellow-400">📝 ${req.admin_notes}</p>` : ''}
            </div>
            ${req.status === 'pending' ? `
                <div class="flex gap-2">
                    <button onclick="approvePayment(${req.id})" 
                            class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded text-sm">
                        ✅ אשר
                    </button>
                    <button onclick="rejectPayment(${req.id})" 
                            class="flex-1 bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm">
                        ❌ דחה
                    </button>
                </div>
            ` : req.status === 'approved' ? `
                <button onclick="completePayment(${req.id})" 
                        class="w-full bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-sm">
                    💰 סמן כשולם
                </button>
            ` : ''}
        </div>
    `).join('');
}

function getPaymentStatusBadge(status) {
    const badges = {
        'pending': '<span class="bg-yellow-500 px-2 py-1 rounded text-xs">⏳ ממתין</span>',
        'approved': '<span class="bg-blue-500 px-2 py-1 rounded text-xs">✅ אושר</span>',
        'rejected': '<span class="bg-red-500 px-2 py-1 rounded text-xs">❌ נדחה</span>',
        'completed': '<span class="bg-emerald-500 px-2 py-1 rounded text-xs">💰 שולם</span>'
    };
    return badges[status] || status;
}

function getPaymentMethodName(method) {
    const methods = {
        'bank_transfer': 'העברה בנקאית',
        'bit': 'ביט',
        'cash': 'מזומן'
    };
    return methods[method] || method;
}

async function approvePayment(requestId) {
    const notes = prompt('הערות (אופציונלי):');
    
    try {
        const response = await fetch(`/api/payments/requests/${requestId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notes: notes || '' })
        });
        
        if (response.ok) {
            showNotification('✅ בקשת המשיכה אושרה');
            loadPayments();
            loadStatistics();
        }
    } catch (error) {
        console.error('Approve payment error:', error);
        showNotification('❌ שגיאה באישור', 'error');
    }
}

async function rejectPayment(requestId) {
    const reason = prompt('סיבת הדחייה:');
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
            showNotification('✅ בקשת המשיכה נדחתה');
            loadPayments();
        }
    } catch (error) {
        console.error('Reject payment error:', error);
        showNotification('❌ שגיאה בדחייה', 'error');
    }
}

async function completePayment(requestId) {
    if (!confirm('האם התשלום בוצע בפועל?')) return;
    
    try {
        const response = await fetch(`/api/payments/requests/${requestId}/complete`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            showNotification('✅ התשלום סומן כשולם');
            loadPayments();
        }
    } catch (error) {
        console.error('Complete payment error:', error);
        showNotification('❌ שגיאה בסימון', 'error');
    }
}

// ==========================================
// SETTINGS
// ==========================================

async function showSettings() {
    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-3xl border border-slate-700 my-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold">⚙️ הגדרות מערכת</h2>
                <button onclick="closeSettings()" class="text-3xl hover:text-red-500">✕</button>
            </div>
            
            <div class="space-y-6">
                <!-- ניהול נציגים -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold mb-3 text-emerald-400">👥 ניהול נציגים</h3>
                    <button onclick="manageAgents()" class="w-full bg-emerald-500 hover:bg-emerald-600 py-3 rounded-lg">
                        👥 נהל נציגים
                    </button>
                </div>
                
                <!-- ניהול שליחים -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold mb-3 text-blue-400">🏍️ ניהול שליחים</h3>
                    <div class="space-y-2">
                        <button onclick="resetCourierEarnings()" class="w-full bg-yellow-500 hover:bg-yellow-600 py-2 rounded text-sm">
                            💰 אפס רווחי שליחים
                        </button>
                        <button onclick="resetCourierRatings()" class="w-full bg-orange-500 hover:bg-orange-600 py-2 rounded text-sm">
                            ⭐ אפס דירוגי שליחים
                        </button>
                        <button onclick="resetAllCouriers()" class="w-full bg-red-500 hover:bg-red-600 py-2 rounded text-sm">
                            🗑️ מחק את כל השליחים
                        </button>
                    </div>
                </div>
                
                <!-- ניקוי נתונים -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <h3 class="font-bold mb-3 text-purple-400">🧹 ניקוי נתונים</h3>
                    <div class="space-y-2">
                        <button onclick="deleteOldOrders()" class="w-full bg-slate-600 hover:bg-slate-500 py-2 rounded text-sm">
                            🗄️ מחק הזמנות ישנות
                        </button>
                        <button onclick="resetStatistics()" class="w-full bg-slate-600 hover:bg-slate-500 py-2 rounded text-sm">
                            📊 אפס סטטיסטיקות
                        </button>
                    </div>
                </div>
            </div>
            
            <button onclick="closeSettings()" 
                    class="w-full mt-6 bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">
                סגור
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.remove();
}

async function manageAgents() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const users = data.users;
            
            closeSettings();
            
            const modal = document.createElement('div');
            modal.id = 'manageAgentsModal';
            modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto';
            modal.innerHTML = `
                <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-3xl border border-slate-700 my-8">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold">👥 ניהול נציגים</h2>
                        <button onclick="closeManageAgents()" class="text-3xl hover:text-red-500">✕</button>
                    </div>
                    
                    ${users.length === 0 ? `
                        <p class="text-center text-slate-400 py-8">אין נציגים במערכת</p>
                    ` : `
                        <div class="space-y-3 mb-6">
                            ${users.map(user => `
                                <div class="bg-slate-700 rounded-lg p-4 flex justify-between items-center">
                                    <div>
                                        <p class="font-bold">${user.name}</p>
                                        <p class="text-sm text-slate-400">${user.username} | ${getRoleNameHebrew(user.role)}</p>
                                        <p class="text-xs text-slate-500">${user.active ? '✅ פעיל' : '❌ לא פעיל'}</p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onclick="changeUserPassword(${user.id}, '${user.username}')"
                                                class="bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-sm">
                                            🔑 שנה סיסמה
                                        </button>
                                        ${user.id !== userData.id ? `
                                            <button onclick="deleteUserConfirm(${user.id}, '${user.name || user.username}')"
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
                    `}
                    
                    <button onclick="closeManageAgents(); showAddAgent();" 
                            class="w-full mb-3 bg-emerald-500 hover:bg-emerald-600 py-3 rounded-lg font-bold">
                        ➕ הוסף נציג נוסף
                    </button>
                    
                    <button onclick="closeManageAgents()" 
                            class="w-full bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">
                        סגור
                    </button>
                </div>
            `;
            
            document.body.appendChild(modal);
        }
    } catch (error) {
        console.error('Manage agents error:', error);
        showNotification('❌ שגיאה בטעינת נציגים', 'error');
    }
}

function closeManageAgents() {
    const modal = document.getElementById('manageAgentsModal');
    if (modal) modal.remove();
}

async function showAddAgent() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700">
            <h2 class="text-2xl font-bold mb-6">➕ הוסף נציג חדש</h2>
            
            <form id="addAgentForm" onsubmit="submitNewAgent(event)" class="space-y-4">
                <div>
                    <label class="block text-sm mb-2">שם מלא *</label>
                    <input type="text" id="agentName" required
                           class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                </div>
                <div>
                    <label class="block text-sm mb-2">שם משתמש *</label>
                    <input type="text" id="agentUsername" required
                           class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                </div>
                <div>
                    <label class="block text-sm mb-2">סיסמה *</label>
                    <input type="password" id="agentPassword" required minlength="6"
                           class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                </div>
                <div>
                    <label class="block text-sm mb-2">תפקיד</label>
                    <select id="agentRole"
                            class="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3">
                        <option value="agent">נציג</option>
                        <option value="manager">מנהל</option>
                        <option value="admin">מנהל ראשי</option>
                    </select>
                </div>
                
                <div class="flex gap-3">
                    <button type="button" onclick="this.closest('.fixed').remove()"
                            class="flex-1 bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">
                        ביטול
                    </button>
                    <button type="submit"
                            class="flex-1 bg-emerald-500 hover:bg-emerald-600 py-3 rounded-lg font-bold">
                        ✅ הוסף
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

async function submitNewAgent(event) {
    event.preventDefault();
    
    const agentData = {
        name: document.getElementById('agentName').value,
        username: document.getElementById('agentUsername').value,
        password: document.getElementById('agentPassword').value,
        role: document.getElementById('agentRole').value
    };
    
    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(agentData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('✅ נציג נוסף בהצלחה!');
            event.target.closest('.fixed').remove();
            manageAgents();
        } else {
            showNotification(`❌ ${data.error || 'שגיאה'}`, 'error');
        }
    } catch (error) {
        console.error('Add agent error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
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
            manageAgents();
        } else {
            showNotification(`❌ ${data.error || 'שגיאה במחיקת נציג'}`, 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function resetCourierEarnings() {
    if (!confirm('האם לאפס את כל הרווחים של השליחים?')) return;
    
    try {
        const response = await fetch('/api/admin/reset-courier-earnings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ ${data.message || 'רווחי שליחים אופסו בהצלחה!'}`);
            loadCouriers();
        } else {
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Reset courier earnings error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function resetCourierRatings() {
    if (!confirm('האם לאפס את כל הדירוגים של השליחים?')) return;
    
    try {
        const response = await fetch('/api/admin/reset-courier-ratings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ ${data.message || 'דירוגי שליחים אופסו בהצלחה!'}`);
            loadCouriers();
        } else {
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Reset courier ratings error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function resetAllCouriers() {
    if (!confirm('⚠️ אזהרה! פעולה זו תמחק את כל השליחים ממערכת!\n\nהאם אתה בטוח?')) return;
    if (!confirm('אישור נוסף: פעולה זו בלתי הפיכה! האם להמשיך?')) return;
    
    try {
        const response = await fetch('/api/admin/reset-all-couriers', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ ${data.message || 'כל השליחים נמחקו בהצלחה!'}`);
            loadCouriers();
            loadStatistics();
        } else {
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Reset all couriers error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function deleteOldOrders() {
    const months = prompt('מחק הזמנות ישנות מ- X חודשים:', '6');
    if (!months) return;
    
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
            showNotification(`✅ ${data.deleted} הזמנות ישנות נמחקו`);
            loadOrders();
            loadStatistics();
        } else {
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Delete old orders error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function resetStatistics() {
    if (!confirm('האם לאפס את כל הסטטיסטיקות? (ימחק את כל ההזמנות!)')) return;
    
    try {
        const response = await fetch('/api/admin/reset-statistics', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ period: 'all' })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification(`✅ ${data.message}`);
            loadOrders();
            loadStatistics();
        } else {
            showNotification('❌ ' + (data.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Reset statistics error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
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
