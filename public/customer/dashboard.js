// ==========================================
// M.M.H DELIVERY - CUSTOMER DASHBOARD
// ==========================================

let customerToken = localStorage.getItem('customerToken');
let customerData = null;

// ==========================================
// AUTHENTICATION
// ==========================================

function checkAuth() {
    customerToken = localStorage.getItem('customerToken');
    const savedData = localStorage.getItem('customerData');
    
    if (customerToken && savedData) {
        customerData = JSON.parse(savedData);
        showDashboard();
    } else {
        document.getElementById('loginModal').classList.remove('hidden');
        document.getElementById('mainContent').classList.add('hidden');
    }
}

async function customerLogin(event) {
    event.preventDefault();
    
    const phone = document.getElementById('loginPhone').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch('/api/auth/customer-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            customerToken = data.token;
            customerData = data.customer;
            localStorage.setItem('customerToken', customerToken);
            localStorage.setItem('customerData', JSON.stringify(customerData));
            
            showDashboard();
        } else {
            showAuthError(data.error || 'שגיאה בהתחברות');
        }
    } catch (error) {
        showAuthError('שגיאת תקשורת');
        console.error('Login error:', error);
    }
}

async function customerRegister(event) {
    event.preventDefault();
    
    const formData = {
        name: document.getElementById('regName').value,
        phone: document.getElementById('regPhone').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value
    };
    
    try {
        const response = await fetch('/api/customers/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            customerToken = data.token;
            customerData = data.customer;
            localStorage.setItem('customerToken', customerToken);
            localStorage.setItem('customerData', JSON.stringify(customerData));
            
            showNotification('✅ נרשמת בהצלחה! ברוך הבא');
            showDashboard();
        } else {
            showAuthError(data.error || 'שגיאה ברישום');
        }
    } catch (error) {
        showAuthError('שגיאת תקשורת');
        console.error('Register error:', error);
    }
}

function showRegisterForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('authError').classList.add('hidden');
}

function showLoginForm() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('authError').classList.add('hidden');
}

function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
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

function showDashboard() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    
    document.getElementById('customerName').textContent = customerData.name;
    document.getElementById('customerPhone').textContent = customerData.phone;
    
    initDashboard();
}

// ==========================================
// DASHBOARD
// ==========================================

async function initDashboard() {
    loadStatistics();
    loadActiveOrders();
}

async function loadStatistics() {
    try {
        const response = await fetch('/api/customers/my-statistics', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const stats = data.statistics;
            
            document.getElementById('statTotal').textContent = stats.total_orders || 0;
            document.getElementById('statActive').textContent = stats.active_orders || 0;
            document.getElementById('statDelivered').textContent = stats.delivered_orders || 0;
            document.getElementById('statSpent').textContent = `₪${parseFloat(stats.total_spent || 0).toLocaleString()}`;
        }
    } catch (error) {
        console.error('Statistics error:', error);
    }
}

// ==========================================
// ORDERS
// ==========================================

async function loadActiveOrders() {
    try {
        const response = await fetch('/api/customers/my-orders?active=true', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayActiveOrders(data.orders);
        }
    } catch (error) {
        console.error('Load orders error:', error);
        document.getElementById('activeOrdersList').innerHTML = `
            <div class="text-center py-8 text-red-400">
                <p>שגיאה בטעינת ההזמנות</p>
            </div>
        `;
    }
}

function displayActiveOrders(orders) {
    const container = document.getElementById('activeOrdersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">📭</div>
                <p class="text-lg font-bold mb-2">אין משלוחים פעילים</p>
                <p class="text-sm">כל המשלוחים שלך הושלמו!</p>
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
                        ${new Date(order.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                    <p>שליח: <strong>${order.courier_first_name} ${order.courier_last_name || ''}</strong></p>
                </div>
                ` : ''}
            </div>
            
            <div class="flex gap-2">
                <button onclick="trackOrder('${order.order_number}')" class="flex-1 bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg text-sm font-bold transition">
                    🔍 עקוב
                </button>
                ${order.status === 'new' || order.status === 'published' ? `
                    <button onclick="cancelOrder(${order.id})" class="flex-1 bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-bold transition">
                        ❌ בטל
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function loadOrderHistory() {
    try {
        const response = await fetch('/api/customers/my-orders?limit=50', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayOrderHistory(data.orders);
        }
    } catch (error) {
        console.error('Load history error:', error);
        document.getElementById('historyOrdersList').innerHTML = `
            <div class="text-center py-8 text-red-400">
                <p>שגיאה בטעינת ההיסטוריה</p>
            </div>
        `;
    }
}

function displayOrderHistory(orders) {
    const container = document.getElementById('historyOrdersList');
    
    if (!orders || orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">📋</div>
                <p>אין הזמנות בהיסטוריה</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = orders.map(order => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600 hover:border-slate-500 transition">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <p class="font-bold">${order.order_number}</p>
                    <p class="text-xs text-slate-400">${new Date(order.created_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div class="text-left">
                    ${getStatusBadge(order.status)}
                    <p class="text-lg font-bold text-emerald-400 mt-1">₪${order.price}</p>
                </div>
            </div>
            <div class="text-sm text-slate-300 space-y-1">
                <p>📍 ${order.pickup_address}</p>
                <p>🏠 ${order.delivery_address}</p>
            </div>
            ${order.status === 'delivered' && !order.rated ? `
                <button onclick="rateOrder(${order.id})" class="mt-3 w-full bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded-lg text-sm font-bold transition">
                    ⭐ דרג שליח
                </button>
            ` : ''}
        </div>
    `).join('');
}

function trackOrder(orderNumber) {
    window.location.href = `/track/${orderNumber}`;
}

async function cancelOrder(orderId) {
    if (!confirm('האם אתה בטוח שברצונך לבטל את ההזמנה?')) return;
    
    const reason = prompt('סיבת ביטול (אופציונלי):');
    
    try {
        const response = await fetch(`/api/customers/orders/${orderId}/cancel`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason || '' })
        });
        
        if (response.ok) {
            showNotification('✅ ההזמנה בוטלה בהצלחה');
            loadActiveOrders();
            loadStatistics();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה בביטול ההזמנה'), 'error');
        }
    } catch (error) {
        console.error('Cancel error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function rateOrder(orderId) {
    const rating = prompt('דירוג (1-5 כוכבים):');
    if (!rating || rating < 1 || rating > 5) {
        showNotification('❌ דירוג לא תקין', 'error');
        return;
    }
    
    const comment = prompt('תגובה (אופציונלי):');
    
    try {
        const response = await fetch(`/api/customers/orders/${orderId}/rate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                rating: parseInt(rating), 
                comment: comment || '' 
            })
        });
        
        if (response.ok) {
            showNotification('✅ תודה על הדירוג!');
            loadOrderHistory();
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה בשמירת הדירוג'), 'error');
        }
    } catch (error) {
        console.error('Rate error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

function getStatusBadge(status) {
    const badges = {
        'new': '<span class="px-3 py-1 rounded-full text-xs bg-slate-500/20 text-slate-300 border border-slate-500/50">חדש</span>',
        'published': '<span class="px-3 py-1 rounded-full text-xs bg-amber-500/20 text-amber-400 border border-amber-500/50">מחכה לשליח</span>',
        'taken': '<span class="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/50">בדרך לאיסוף</span>',
        'picked': '<span class="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400 border border-purple-500/50">בדרך אליך</span>',
        'delivered': '<span class="px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">✅ נמסר</span>',
        'cancelled': '<span class="px-3 py-1 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/50">❌ בוטל</span>'
    };
    return badges[status] || '<span class="px-3 py-1 rounded-full text-xs bg-gray-500/20 text-gray-400">לא ידוע</span>';
}

// ==========================================
// TABS
// ==========================================

function switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('[id^="tab"]').forEach(t => {
        if (t.id.startsWith('tab')) {
            t.className = 'tab-inactive px-6 py-3';
        }
    });
    
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    
    // Show selected tab
    const tabButton = document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (tabButton) {
        tabButton.className = 'tab-active px-6 py-3 font-bold';
    }
    
    const tabContent = document.getElementById(`${tab}Tab`);
    if (tabContent) {
        tabContent.classList.remove('hidden');
    }
    
    // Load content based on tab
    if (tab === 'active') loadActiveOrders();
    if (tab === 'history') loadOrderHistory();
    if (tab === 'addresses') loadSavedAddresses();
    if (tab === 'settings') loadSettings();
}

// ==========================================
// SAVED ADDRESSES
// ==========================================

async function loadSavedAddresses() {
    const container = document.getElementById('addressesList');
    
    try {
        const response = await fetch('/api/customers/saved-addresses', {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displaySavedAddresses(data.addresses || []);
        } else {
            container.innerHTML = '<p class="text-slate-400 text-center py-8">שגיאה בטעינת כתובות</p>';
        }
    } catch (error) {
        console.error('Load addresses error:', error);
        container.innerHTML = '<p class="text-slate-400 text-center py-8">אין כתובות שמורות</p>';
    }
}

function displaySavedAddresses(addresses) {
    const container = document.getElementById('addressesList');
    
    if (!addresses || addresses.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-slate-400">
                <div class="text-6xl mb-4">📍</div>
                <p>אין כתובות שמורות</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = addresses.map(addr => `
        <div class="bg-slate-700 rounded-lg p-4 border border-slate-600 flex justify-between items-start">
            <div>
                <p class="font-bold mb-1">${addr.label || 'כתובת'}</p>
                <p class="text-sm text-slate-300">${addr.address}</p>
            </div>
            <div class="flex gap-2">
                <button onclick="useAddress(${addr.id})" class="bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded text-sm">
                    השתמש
                </button>
                <button onclick="deleteAddress(${addr.id})" class="bg-red-500 hover:bg-red-600 px-3 py-1 rounded text-sm">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

async function addNewAddress() {
    const label = prompt('שם הכתובת (לדוגמא: בית, עבודה):');
    if (!label) return;
    
    const address = prompt('כתובת מלאה:');
    if (!address) return;
    
    try {
        const response = await fetch('/api/customers/saved-addresses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ label, address })
        });
        
        if (response.ok) {
            showNotification('✅ כתובת נשמרה');
            loadSavedAddresses();
        } else {
            showNotification('❌ שגיאה בשמירת הכתובת', 'error');
        }
    } catch (error) {
        console.error('Add address error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function deleteAddress(addressId) {
    if (!confirm('האם למחוק את הכתובת?')) return;
    
    try {
        const response = await fetch(`/api/customers/saved-addresses/${addressId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            showNotification('✅ כתובת נמחקה');
            loadSavedAddresses();
        } else {
            showNotification('❌ שגיאה במחיקת הכתובת', 'error');
        }
    } catch (error) {
        console.error('Delete address error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

function useAddress(addressId) {
    showNotification('כתובת נבחרה - מעבר לטופס הזמנה');
    // Navigate to order form with address pre-filled
    window.location.href = `/customer/?address=${addressId}`;
}

// ==========================================
// SETTINGS
// ==========================================

async function loadSettings() {
    if (customerData) {
        document.getElementById('settingsName').value = customerData.name || '';
        document.getElementById('settingsEmail').value = customerData.email || '';
    }
}

async function updateProfile() {
    const name = document.getElementById('settingsName').value;
    const email = document.getElementById('settingsEmail').value;
    
    if (!name) {
        showNotification('❌ שם הוא שדה חובה', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/customers/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email })
        });
        
        if (response.ok) {
            const data = await response.json();
            customerData = data.customer;
            localStorage.setItem('customerData', JSON.stringify(customerData));
            
            document.getElementById('customerName').textContent = name;
            showNotification('✅ פרופיל עודכן בהצלחה');
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה בעדכון'), 'error');
        }
    } catch (error) {
        console.error('Update profile error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    
    if (!currentPassword || !newPassword) {
        showNotification('❌ נא למלא את כל השדות', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('❌ סיסמה חדשה חייבת להכיל לפחות 6 תווים', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/customers/change-password', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                current_password: currentPassword, 
                new_password: newPassword 
            })
        });
        
        if (response.ok) {
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            showNotification('✅ סיסמה שונתה בהצלחה');
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'סיסמה נוכחית שגויה'), 'error');
        }
    } catch (error) {
        console.error('Change password error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

async function deleteAccount() {
    if (!confirm('⚠️ האם אתה בטוח שברצונך למחוק את החשבון?\n\nפעולה זו אינה הפיכה!')) return;
    
    const password = prompt('אנא הזן את הסיסמה שלך לאישור:');
    if (!password) return;
    
    try {
        const response = await fetch('/api/customers/delete-account', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${customerToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });
        
        if (response.ok) {
            showNotification('חשבון נמחק בהצלחה');
            setTimeout(() => {
                localStorage.clear();
                location.href = '/';
            }, 2000);
        } else {
            const data = await response.json();
            showNotification('❌ ' + (data.error || 'שגיאה במחיקת חשבון'), 'error');
        }
    } catch (error) {
        console.error('Delete account error:', error);
        showNotification('❌ שגיאת תקשורת', 'error');
    }
}

// ==========================================
// SEARCH
// ==========================================

async function searchOrders() {
    const query = document.getElementById('searchOrders').value.trim();
    
    if (!query) {
        loadOrderHistory();
        return;
    }
    
    try {
        const response = await fetch(`/api/customers/my-orders?search=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${customerToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayOrderHistory(data.orders);
            showNotification(`נמצאו ${data.orders.length} תוצאות`);
        }
    } catch (error) {
        console.error('Search error:', error);
        showNotification('❌ שגיאה בחיפוש', 'error');
    }
}

// Allow search on Enter key
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchOrders');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchOrders();
        });
    }
});

// ==========================================
// MODALS
// ==========================================

function showNewOrderModal() {
    document.getElementById('newOrderModal').classList.remove('hidden');
}

function closeNewOrderModal() {
    document.getElementById('newOrderModal').classList.add('hidden');
}

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeNewOrderModal();
    }
});

// ==========================================
// UTILITIES
// ==========================================

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 ${
        type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
    } text-white font-bold animate-fade-in`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==========================================
// AUTO-REFRESH
// ==========================================

// Auto-refresh active orders every 30 seconds
let refreshInterval;

function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        if (document.getElementById('activeTab').classList.contains('hidden') === false) {
            loadActiveOrders();
            loadStatistics();
        }
    }, 30000); // 30 seconds
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

// ==========================================
// INIT
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    startAutoRefresh();
});

// Stop refresh when page is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoRefresh();
    } else {
        startAutoRefresh();
    }
});