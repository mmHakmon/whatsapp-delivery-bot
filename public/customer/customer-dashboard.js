// Global variables
let customerToken = localStorage.getItem('customerToken');
let customerData = null;

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    if (customerToken) {
        loadDashboard();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
    }
});

// ==========================================
// AUTHENTICATION
// ==========================================

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('btnShowLogin').classList.add('bg-emerald-500');
    document.getElementById('btnShowLogin').classList.remove('bg-slate-700');
    document.getElementById('btnShowRegister').classList.remove('bg-emerald-500');
    document.getElementById('btnShowRegister').classList.add('bg-slate-700');
}

function showRegisterForm() {
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('btnShowRegister').classList.add('bg-emerald-500');
    document.getElementById('btnShowRegister').classList.remove('bg-slate-700');
    document.getElementById('btnShowLogin').classList.remove('bg-emerald-500');
    document.getElementById('btnShowLogin').classList.add('bg-slate-700');
}

async function handleLogin(event) {
    event.preventDefault();
    
    const phone = document.getElementById('loginPhone').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/customers/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('customerToken', data.token);
            localStorage.setItem('customerData', JSON.stringify(data.customer));
            customerToken = data.token;
            customerData = data.customer;
            loadDashboard();
        } else {
            showAuthError(data.error || 'שגיאה בהתחברות');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAuthError('שגיאת תקשורת');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const data = {
        name: document.getElementById('regName').value,
        phone: document.getElementById('regPhone').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value,
        businessName: document.getElementById('regBusinessName').value,
        businessType: document.getElementById('regBusinessType').value,
        address: document.getElementById('regAddress').value
    };
    
    try {
        const response = await fetch('/api/customers/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            localStorage.setItem('customerToken', result.token);
            localStorage.setItem('customerData', JSON.stringify(result.customer));
            customerToken = result.token;
            customerData = result.customer;
            loadDashboard();
        } else {
            showAuthError(result.error || 'שגיאה ברישום');
        }
    } catch (error) {
        console.error('Register error:', error);
        showAuthError('שגיאת תקשורת');
    }
}

function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 5000);
}

function logout() {
    if (confirm('האם להתנתק?')) {
        localStorage.removeItem('customerToken');
        localStorage.removeItem('customerData');
        location.reload();
    }
}

// ==========================================
// DASHBOARD
// ==========================================

async function loadDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    
    // Load customer data if not in localStorage
    if (!customerData) {
        customerData = JSON.parse(localStorage.getItem('customerData'));
    }
    
    // Update welcome message
    document.getElementById('welcomeName').textContent = `שלום ${customerData.name}!`;
    
    // Load all data
    await Promise.all([
        loadStatistics(),
        loadOrders()
    ]);
}

// ==========================================
// STATISTICS
// ==========================================

async function loadStatistics() {
    try {
        const response = await fetch('/api/customers/statistics', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const stats = data.statistics;
            
            document.getElementById('statTotal').textContent = stats.total_orders || 0;
            document.getElementById('statActive').textContent = stats.active_orders || 0;
            document.getElementById('statCompleted').textContent = stats.completed_orders || 0;
            document.getElementById('statSpent').textContent = `₪${parseFloat(stats.total_spent || 0).toLocaleString()}`;
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
        const response = await fetch('/api/customers/orders?limit=50', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
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
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">📦</div>
                <p class="text-xl mb-4">אין הזמנות עדיין</p>
                <button onclick="createNewOrder()" class="bg-emerald-500 hover:bg-emerald-600 px-6 py-3 rounded-lg font-bold">
                    ➕ צור הזמנה ראשונה
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="bg-slate-700 rounded-lg p-4 mb-3 border border-slate-600 hover:border-emerald-500 transition">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <span class="font-bold text-lg">${order.order_number}</span>
                    <span class="mr-3 text-sm ${getStatusBadgeClass(order.status)}">${getStatusText(order.status)}</span>
                </div>
                <div class="text-right">
                    <p class="font-bold text-emerald-400">₪${order.total_price}</p>
                    <p class="text-xs text-slate-400">${formatDate(order.created_at)}</p>
                </div>
            </div>
            <div class="text-sm text-slate-300 space-y-1">
                <p>📍 מ: ${order.pickup_address}</p>
                <p>📍 ל: ${order.delivery_address}</p>
                ${order.courier_first_name ? `<p>🏍️ שליח: ${order.courier_first_name} ${order.courier_last_name}</p>` : ''}
            </div>
            <div class="mt-3 flex gap-2">
                <button onclick="viewOrderDetails('${order.id}')" class="flex-1 bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded text-sm">
                    👁️ פרטים
                </button>
                ${order.status !== 'delivered' && order.status !== 'cancelled' ? `
                    <button onclick="trackOrder('${order.order_number}')" class="flex-1 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded text-sm">
                        📍 מעקב
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function getStatusBadgeClass(status) {
    const classes = {
        'new': 'bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded',
        'published': 'bg-blue-500/20 text-blue-400 px-2 py-1 rounded',
        'taken': 'bg-purple-500/20 text-purple-400 px-2 py-1 rounded',
        'picked': 'bg-orange-500/20 text-orange-400 px-2 py-1 rounded',
        'delivered': 'bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded',
        'cancelled': 'bg-red-500/20 text-red-400 px-2 py-1 rounded'
    };
    return classes[status] || classes.new;
}

function getStatusText(status) {
    const texts = {
        'new': '🆕 חדשה',
        'published': '🔵 ממתינה לשליח',
        'taken': '🏃 נתפס',
        'picked': '📦 נאסף',
        'delivered': '✅ נמסר',
        'cancelled': '❌ בוטל'
    };
    return texts[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'עכשיו';
    if (diffMins < 60) return `לפני ${diffMins} דקות`;
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    if (diffDays < 7) return `לפני ${diffDays} ימים`;
    
    return date.toLocaleDateString('he-IL');
}

async function viewOrderDetails(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}`, {
            headers: { "Authorization": `Bearer ${customerToken}` }
        });
        if (!response.ok) {
            showNotification("❌ שגיאה בטעינת פרטים");
            return;
        }
        const { order } = await response.json();
        const modal = document.createElement("div");
        modal.id = "orderDetailsModal";
        modal.className = "fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4";
        modal.innerHTML = `<div class="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700"><div class="flex justify-between items-center mb-6"><h2 class="text-2xl font-bold">📦 פרטי הזמנה</h2><button onclick="closeOrderDetails()" class="text-slate-400 hover:text-white text-3xl">×</button></div><div class="bg-slate-700 rounded-lg p-4 mb-6"><div class="flex justify-between items-center"><div><p class="text-sm text-slate-400">מספר הזמנה</p><p class="text-2xl font-bold">${order.order_number}</p></div><div class="text-right"><span class="${getStatusBadgeClass(order.status)} text-lg px-4 py-2">${getStatusText(order.status)}</span></div></div></div><div class="bg-slate-700 rounded-lg p-4 mb-4"><h3 class="font-bold text-emerald-400 mb-3">📤 שולח</h3><p><strong>שם:</strong> ${order.sender_name}</p><p><strong>טלפון:</strong> ${order.sender_phone}</p><p><strong>כתובת:</strong> ${order.pickup_address}</p></div><div class="bg-slate-700 rounded-lg p-4 mb-4"><h3 class="font-bold text-blue-400 mb-3">📥 מקבל</h3><p><strong>שם:</strong> ${order.receiver_name}</p><p><strong>טלפון:</strong> ${order.receiver_phone}</p><p><strong>כתובת:</strong> ${order.delivery_address}</p></div><div class="bg-emerald-500/10 border border-emerald-500 rounded-lg p-4 mb-4"><h3 class="font-bold text-emerald-400 mb-3">💰 מחיר</h3><p class="text-2xl font-bold">₪${order.total_price}</p></div><button onclick="closeOrderDetails()" class="w-full bg-slate-600 hover:bg-slate-500 py-3 rounded-lg font-bold">סגור</button></div>`;
        document.body.appendChild(modal);
        modal.addEventListener("click", (e) => { if (e.target === modal) closeOrderDetails(); });
    } catch (error) {
        console.error("Error:", error);
        showNotification("❌ שגיאה");
    }
}

function closeOrderDetails() {
    const modal = document.getElementById("orderDetailsModal");
    if (modal) modal.remove();
}

function getVehicleTypeText(type) {
    const types = { "motorcycle": "🏍️ אופנוע", "car": "🚗 רכב", "van": "🚐 מסחרית", "truck": "🚚 משאית" };
    return types[type] || type;
}

function formatDateTime(dateString) {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("he-IL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function trackOrder(orderNumber) {
    window.open(`/track/${orderNumber}`, '_blank');
}

function createNewOrder() {
    window.open('/customer/order.html', '_blank');
}

// ==========================================
// TABS
// ==========================================

function switchTab(tab) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[id^="tab"]').forEach(el => {
        el.classList.remove('tab-active');
        el.classList.add('tab-inactive');
    });
    
    // Show selected tab
    document.getElementById(`content${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove('hidden');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove('tab-inactive');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('tab-active');
    
    // Load tab content
    if (tab === 'history') loadHistory();
    if (tab === 'profile') loadProfile();
    if (tab === 'settings') loadSettings();
    if (tab === 'support') loadSupport();
}

// ==========================================
// HISTORY TAB
// ==========================================

async function loadHistory() {
    try {
        const response = await fetch('/api/customers/statistics', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayHistory(data);
        }
    } catch (error) {
        console.error('Load history error:', error);
    }
}

function displayHistory(data) {
    const container = document.getElementById('historyContent');
    const stats = data.statistics;
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div class="bg-slate-700 rounded-lg p-4">
                <h3 class="font-bold mb-2">סטטיסטיקות כלליות</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span>סה"כ הזמנות:</span>
                        <span class="font-bold">${stats.total_orders}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>הושלמו:</span>
                        <span class="font-bold text-emerald-400">${stats.completed_orders}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>בוטלו:</span>
                        <span class="font-bold text-red-400">${stats.cancelled_orders}</span>
                    </div>
                    <div class="flex justify-between border-t border-slate-600 pt-2 mt-2">
                        <span>סה"כ הוצאות:</span>
                        <span class="font-bold text-amber-400">₪${parseFloat(stats.total_spent || 0).toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span>ממוצע הזמנה:</span>
                        <span class="font-bold">₪${parseFloat(stats.avg_order_value || 0).toFixed(0)}</span>
                    </div>
                </div>
            </div>
            
            <div class="bg-slate-700 rounded-lg p-4">
                <h3 class="font-bold mb-2">מסלולים פופולריים</h3>
                <div class="space-y-2 text-sm">
                    ${data.favoriteRoutes && data.favoriteRoutes.length > 0 ? data.favoriteRoutes.map(route => `
                        <div class="border-b border-slate-600 pb-2">
                            <p class="text-xs text-slate-400">מ: ${route.pickup_address}</p>
                            <p class="text-xs text-slate-400">ל: ${route.delivery_address}</p>
                            <p class="text-emerald-400 font-bold">${route.count} משלוחים</p>
                        </div>
                    `).join('') : '<p class="text-slate-400">אין נתונים</p>'}
                </div>
            </div>
        </div>
        
        ${data.monthly && data.monthly.length > 0 ? `
            <div class="bg-slate-700 rounded-lg p-4">
                <h3 class="font-bold mb-4">משלוחים חודשיים (6 חודשים אחרונים)</h3>
                <div class="space-y-3">
                    ${data.monthly.map(m => `
                        <div class="flex items-center gap-3">
                            <span class="text-sm w-24">${formatMonth(m.month)}</span>
                            <div class="flex-1 bg-slate-600 rounded-full h-6 overflow-hidden">
                                <div class="bg-emerald-500 h-full flex items-center px-3 text-xs font-bold" 
                                     style="width: ${Math.min(100, (m.orders / Math.max(...data.monthly.map(x => x.orders)) * 100))}%">
                                    ${m.orders}
                                </div>
                            </div>
                            <span class="text-sm w-24 text-left">₪${parseFloat(m.total).toLocaleString()}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

function formatMonth(monthString) {
    const [year, month] = monthString.split('-');
    const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 
                   'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    return `${months[parseInt(month) - 1]} ${year}`;
}

// ==========================================
// PROFILE TAB
// ==========================================

async function loadProfile() {
    try {
        const response = await fetch('/api/customers/profile', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayProfile(data.customer);
        }
    } catch (error) {
        console.error('Load profile error:', error);
    }
}

function displayProfile(customer) {
    const container = document.getElementById('profileContent');
    
    container.innerHTML = `
        <form onsubmit="updateProfile(event)" class="space-y-4 max-w-2xl">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm mb-2">שם מלא</label>
                    <input type="text" id="profileName" value="${customer.name || ''}"
                           class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm mb-2">טלפון</label>
                    <input type="text" value="${customer.phone || ''}" disabled
                           class="w-full bg-slate-600 border border-slate-600 rounded px-3 py-2 text-slate-400">
                </div>
            </div>
            
            <div>
                <label class="block text-sm mb-2">אימייל</label>
                <input type="email" id="profileEmail" value="${customer.email || ''}"
                       class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2">
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm mb-2">שם עסק</label>
                    <input type="text" id="profileBusinessName" value="${customer.business_name || ''}"
                           class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm mb-2">סוג עסק</label>
                    <select id="profileBusinessType" class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2">
                        <option value="">בחר...</option>
                        <option value="restaurant" ${customer.business_type === 'restaurant' ? 'selected' : ''}>מסעדה</option>
                        <option value="store" ${customer.business_type === 'store' ? 'selected' : ''}>חנות</option>
                        <option value="office" ${customer.business_type === 'office' ? 'selected' : ''}>משרד</option>
                        <option value="personal" ${customer.business_type === 'personal' ? 'selected' : ''}>אישי</option>
                        <option value="other" ${customer.business_type === 'other' ? 'selected' : ''}>אחר</option>
                    </select>
                </div>
            </div>
            
            <div>
                <label class="block text-sm mb-2">כתובת ברירת מחדל</label>
                <input type="text" id="profileAddress" value="${customer.address || ''}"
                       class="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2">
            </div>
            
            <button type="submit" class="bg-emerald-500 hover:bg-emerald-600 px-6 py-3 rounded-lg font-bold">
                💾 שמור שינויים
            </button>
        </form>
    `;
}

async function updateProfile(event) {
    event.preventDefault();
    
    const data = {
        name: document.getElementById('profileName').value,
        email: document.getElementById('profileEmail').value,
        businessName: document.getElementById('profileBusinessName').value,
        businessType: document.getElementById('profileBusinessType').value,
        address: document.getElementById('profileAddress').value
    };
    
    try {
        const response = await fetch('/api/customers/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            localStorage.setItem('customerData', JSON.stringify(result.customer));
            customerData = result.customer;
            showNotification('✅ פרופיל עודכן בהצלחה!');
        } else {
            showNotification('❌ שגיאה בעדכון', 'error');
        }
    } catch (error) {
        console.error('Update profile error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

// ==========================================
// SETTINGS TAB
// ==========================================

async function loadSettings() {
    try {
        const response = await fetch('/api/customers/profile', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displaySettings(data.customer);
        }
    } catch (error) {
        console.error('Load settings error:', error);
    }
}

function displaySettings(customer) {
    const container = document.getElementById('settingsContent');
    
    container.innerHTML = `
        <div class="space-y-6 max-w-2xl">
            <!-- Notifications -->
            <div class="bg-slate-700 rounded-lg p-4">
                <h3 class="font-bold mb-4">🔔 הגדרות התראות</h3>
                <div class="space-y-3">
                    <label class="flex items-center justify-between">
                        <span>התראות WhatsApp</span>
                        <input type="checkbox" id="notifWhatsapp" ${customer.whatsapp_notifications ? 'checked' : ''}
                               onchange="updateNotifications()"
                               class="w-6 h-6">
                    </label>
                    <label class="flex items-center justify-between">
                        <span>התראות SMS</span>
                        <input type="checkbox" id="notifSms" ${customer.sms_notifications ? 'checked' : ''}
                               onchange="updateNotifications()"
                               class="w-6 h-6">
                    </label>
                    <label class="flex items-center justify-between">
                        <span>התראות אימייל</span>
                        <input type="checkbox" id="notifEmail" ${customer.email_notifications ? 'checked' : ''}
                               onchange="updateNotifications()"
                               class="w-6 h-6">
                    </label>
                </div>
            </div>
            
            <!-- Change Password -->
            <div class="bg-slate-700 rounded-lg p-4">
                <h3 class="font-bold mb-4">🔐 שינוי סיסמה</h3>
                <form onsubmit="changePassword(event)" class="space-y-3">
                    <div>
                        <label class="block text-sm mb-2">סיסמה נוכחית</label>
                        <input type="password" id="currentPassword" required
                               class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2">
                    </div>
                    <div>
                        <label class="block text-sm mb-2">סיסמה חדשה</label>
                        <input type="password" id="newPassword" required minlength="6"
                               class="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2">
                    </div>
                    <button type="submit" class="bg-blue-500 hover:bg-blue-600 px-6 py-2 rounded font-bold">
                        שנה סיסמה
                    </button>
                </form>
            </div>
            
            <!-- Danger Zone -->
            <div class="bg-red-500/10 border border-red-500 rounded-lg p-4">
                <h3 class="font-bold mb-4 text-red-400">⚠️ אזור מסוכן</h3>
                <button onclick="deleteAccount()" class="bg-red-600 hover:bg-red-700 px-6 py-2 rounded font-bold">
                    🗑️ מחק חשבון
                </button>
                <p class="text-xs text-red-300 mt-2">פעולה זו בלתי הפיכה!</p>
            </div>
        </div>
    `;
}

async function updateNotifications() {
    const data = {
        whatsapp: document.getElementById('notifWhatsapp').checked,
        sms: document.getElementById('notifSms').checked,
        email: document.getElementById('notifEmail').checked
    };
    
    try {
        await fetch('/api/customers/notifications', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        showNotification('✅ הגדרות התראות עודכנו!');
    } catch (error) {
        console.error('Update notifications error:', error);
    }
}

async function changePassword(event) {
    event.preventDefault();
    
    const data = {
        currentPassword: document.getElementById('currentPassword').value,
        newPassword: document.getElementById('newPassword').value
    };
    
    try {
        const response = await fetch('/api/customers/change-password', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showNotification('✅ סיסמה שונתה בהצלחה!');
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
        } else {
            const result = await response.json();
            showNotification('❌ ' + (result.error || 'שגיאה'), 'error');
        }
    } catch (error) {
        console.error('Change password error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

function deleteAccount() {
    showNotification('⚠️ מחיקת חשבון - פונקציה מושבתת', 'error');
}

// ==========================================
// SUPPORT TAB
// ==========================================

async function loadSupport() {
    try {
        const response = await fetch('/api/customers/support', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displaySupport(data.support);
        }
    } catch (error) {
        console.error('Load support error:', error);
    }
}

function displaySupport(support) {
    const container = document.getElementById('supportContent');
    
    container.innerHTML = `
        <div class="max-w-2xl space-y-6">
            <div class="text-center mb-8">
                <div class="text-6xl mb-4">💬</div>
                <h3 class="text-2xl font-bold mb-2">צריכים עזרה?</h3>
                <p class="text-slate-400">אנחנו כאן בשבילכם!</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- WhatsApp -->
                <a href="${support.whatsapp.url}" target="_blank"
                   class="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-xl p-6 text-center hover:scale-105 transition">
                    <div class="text-5xl mb-3">📱</div>
                    <h4 class="font-bold text-xl mb-2">WhatsApp</h4>
                    <p class="text-sm mb-3">${support.whatsapp.number}</p>
                    <div class="bg-white/20 rounded px-4 py-2 inline-block">
                        שלח הודעה עכשיו
                    </div>
                </a>
                
                <!-- Phone -->
                <a href="${support.phone.url}"
                   class="bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl p-6 text-center hover:scale-105 transition">
                    <div class="text-5xl mb-3">📞</div>
                    <h4 class="font-bold text-xl mb-2">טלפון</h4>
                    <p class="text-sm mb-3">${support.phone.number}</p>
                    <div class="bg-white/20 rounded px-4 py-2 inline-block">
                        התקשר עכשיו
                    </div>
                </a>
            </div>
            
            <!-- Email -->
            <div class="bg-slate-700 rounded-lg p-6 text-center">
                <div class="text-4xl mb-3">📧</div>
                <h4 class="font-bold text-lg mb-2">אימייל</h4>
                <a href="mailto:${support.email}" class="text-emerald-400 hover:underline">
                    ${support.email}
                </a>
            </div>
            
            <!-- Hours -->
            <div class="bg-slate-700 rounded-lg p-6 text-center">
                <div class="text-4xl mb-3">🕐</div>
                <h4 class="font-bold text-lg mb-2">שעות פעילות</h4>
                <p class="text-slate-300">${support.hours}</p>
            </div>
            
            <!-- FAQ -->
            <div class="bg-slate-700 rounded-lg p-6">
                <h4 class="font-bold text-lg mb-4">❓ שאלות נפוצות</h4>
                <div class="space-y-3 text-sm">
                    <div class="border-b border-slate-600 pb-2">
                        <p class="font-bold mb-1">איך אני עוקב אחרי המשלוח?</p>
                        <p class="text-slate-400">לחץ על "מעקב" בהזמנה כדי לראות את מיקום השליח בזמן אמת</p>
                    </div>
                    <div class="border-b border-slate-600 pb-2">
                        <p class="font-bold mb-1">כמה זמן לוקח משלוח?</p>
                        <p class="text-slate-400">המשלוח נתפס תוך דקות, והזמן תלוי במרחק</p>
                    </div>
                    <div>
                        <p class="font-bold mb-1">מה אם יש בעיה עם המשלוח?</p>
                        <p class="text-slate-400">צור קשר איתנו מיד דרך WhatsApp או טלפון</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// NOTIFICATION
// ==========================================

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const text = document.getElementById('notificationText');
    
    text.textContent = message;
    notification.classList.remove('hidden');
    
    if (type === 'error') {
        notification.classList.add('border-red-500');
        notification.classList.remove('border-emerald-500');
    } else {
        notification.classList.add('border-emerald-500');
        notification.classList.remove('border-red-500');
    }
    
    setTimeout(() => notification.classList.add('hidden'), 4000);
}
