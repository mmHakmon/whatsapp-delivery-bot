// ==========================================
// M.M.H DELIVERY - COURIER APP
// ==========================================

let courierToken = localStorage.getItem('courierToken');
let courierData = null;
let ws = null;
let locationInterval = null;

// ✅ הוסף משתנים חדשים לגרפים
let earningsChart = null;
let hourlyChart = null;

// ==========================================
// AUTHENTICATION
// ==========================================

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

function logoutCourier() {
    if (confirm('האם אתה בטוח שברצונך להתנתק?')) {
        localStorage.removeItem('courierToken');
        localStorage.removeItem('courierData');
        
        if (ws) {
            ws.close();
        }
        
        if (locationInterval) {
            clearInterval(locationInterval);
        }
        
        window.location.reload();
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
    loadAdvancedDashboard();
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
// ORDERS VIEW SWITCHER
// ==========================================

function switchOrdersView(view) {
    const availableList = document.getElementById('availableOrdersList');
    const activeList = document.getElementById('activeOrdersList');
    const btnAvailable = document.getElementById('btnAvailable');
    const btnActive = document.getElementById('btnActive');
    const ordersTitle = document.getElementById('ordersTitle');
    const ordersCount = document.getElementById('ordersCount');
    
    if (view === 'available') {
        availableList.classList.remove('hidden');
        activeList.classList.add('hidden');
        btnAvailable.className = 'px-4 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-white';
        btnActive.className = 'px-4 py-2 rounded-lg text-sm font-bold bg-slate-700 text-slate-300';
        ordersTitle.textContent = '📦 משלוחים זמינים';
        loadAvailableOrders();
    } else {
        availableList.classList.add('hidden');
        activeList.classList.remove('hidden');
        btnAvailable.className = 'px-4 py-2 rounded-lg text-sm font-bold bg-slate-700 text-slate-300';
        btnActive.className = 'px-4 py-2 rounded-lg text-sm font-bold bg-blue-500 text-white';
        ordersTitle.textContent = '🔵 משלוחים פעילים';
        loadMyOrders();
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
// ADVANCED DASHBOARD
// ==========================================

async function loadAdvancedDashboard() {
    await Promise.all([
        loadAdvancedStatistics(),
        loadGoals(),
        loadRanking(),
        loadEarningsProjection(),
        loadPerformanceMetrics()
    ]);
}

async function loadAdvancedStatistics() {
    try {
        const response = await fetch('/api/couriers/advanced-statistics', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (!response.ok) {
            console.log('Failed to load advanced statistics');
            return;
        }
        
        const data = await response.json();
        const stats = data.statistics || {};
        
        // עדכן סטטיסטיקות בטאב סטטיסטיקות (עם 2)
        const statToday2 = document.getElementById('statToday2');
        const statWeek2 = document.getElementById('statWeek2');
        const statMonth2 = document.getElementById('statMonth2');
        
        if (statToday2) statToday2.textContent = stats.today_deliveries || 0;
        if (statWeek2) statWeek2.textContent = stats.week_deliveries || 0;
        if (statMonth2) statMonth2.textContent = stats.month_deliveries || 0;
        
        // עדכן הכנסות
        const todayEarningsElem = document.getElementById('todayEarnings');
        const weekEarningsElem = document.getElementById('weekEarnings');
        const monthEarningsElem = document.getElementById('monthEarnings');
        
        if (todayEarningsElem) todayEarningsElem.textContent = `₪${(stats.today_earnings || 0).toFixed(0)}`;
        if (weekEarningsElem) weekEarningsElem.textContent = `₪${(stats.week_earnings || 0).toFixed(0)}`;
        if (monthEarningsElem) monthEarningsElem.textContent = `₪${(stats.month_earnings || 0).toFixed(0)}`;
        
        const avgElem = document.getElementById('avgPerDelivery');
        if (avgElem) avgElem.textContent = `₪${(stats.avg_earning_per_delivery || 0).toFixed(0)}`;
        
        const completionElem = document.getElementById('completionRate');
        if (completionElem) completionElem.textContent = `${stats.completion_percentage || 0}%`;
        
        // צור גרפים רק אם יש נתונים תקינים
        if (data.dailyEarnings && Array.isArray(data.dailyEarnings)) {
            createEarningsChart(data.dailyEarnings);
        }
        
        if (data.hourlyDeliveries && Array.isArray(data.hourlyDeliveries)) {
            createHourlyChart(data.hourlyDeliveries);
        }
        
    } catch (error) {
        console.error('Advanced statistics error:', error);
    }
}

function createEarningsChart(data) {
    const ctx = document.getElementById('earningsChart');
    if (!ctx || typeof Chart === 'undefined') return;
    
    // הרוס גרף קודם אם קיים
    if (earningsChart) {
        earningsChart.destroy();
        earningsChart = null;
    }
    
    // בדיקת תקינות נתונים
    if (!data || !Array.isArray(data)) {
        console.log('No valid earnings data');
        return;
    }
    
    const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const earnings = new Array(7).fill(0);
    
    data.forEach(day => {
        if (day && day.date && day.earnings) {
            const date = new Date(day.date);
            earnings[date.getDay()] = parseFloat(day.earnings) || 0;
        }
    });
    
    earningsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                data: earnings,
                backgroundColor: 'rgba(34, 197, 94, 0.5)',
                borderColor: 'rgb(34, 197, 94)',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                },
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                }
            }
        }
    });
}

function createHourlyChart(data) {
    const ctx = document.getElementById('hourlyChart');
    if (!ctx || typeof Chart === 'undefined') return;
    
    // הרוס גרף קודם אם קיים
    if (hourlyChart) {
        hourlyChart.destroy();
        hourlyChart = null;
    }
    
    // בדיקת תקינות נתונים
    if (!data || !Array.isArray(data)) {
        console.log('No valid hourly data');
        return;
    }
    
    const hours = [];
    const deliveries = [];
    
    data.forEach(item => {
        if (item && item.hour !== undefined && item.deliveries !== undefined) {
            hours.push(`${item.hour}:00`);
            deliveries.push(parseInt(item.deliveries) || 0);
        }
    });
    
    // אם אין נתונים, צור דוגמה ריקה
    if (hours.length === 0) {
        hours.push('8:00', '12:00', '16:00', '20:00');
        deliveries.push(0, 0, 0, 0);
    }
    
    hourlyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: hours,
            datasets: [{
                data: deliveries,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8', stepSize: 1 },
                    grid: { color: '#334155' }
                },
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                }
            }
        }
    });
}

async function loadGoals() {
    try {
        const response = await fetch('/api/couriers/goals', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (!response.ok) return;
        const data = await response.json();
        
        const daily = data.daily.deliveries;
        const dailyGoalText = document.getElementById('dailyGoalText');
        const dailyGoalBar = document.getElementById('dailyGoalBar');
        const dailyGoalRemaining = document.getElementById('dailyGoalRemaining');
        
        if (dailyGoalText) dailyGoalText.textContent = `${daily.current} / ${daily.goal}`;
        if (dailyGoalBar) dailyGoalBar.style.width = `${daily.percentage}%`;
        if (dailyGoalRemaining) {
            const remaining = daily.goal - daily.current;
            dailyGoalRemaining.textContent = remaining > 0 ? `עוד ${remaining} משלוחים!` : 'היעד הושג! 🎉';
        }
        
        const dailyEarnings = data.daily.earnings;
        const dailyEarningsGoalText = document.getElementById('dailyEarningsGoalText');
        const dailyEarningsGoalBar = document.getElementById('dailyEarningsGoalBar');
        
        if (dailyEarningsGoalText) {
            dailyEarningsGoalText.textContent = `₪${dailyEarnings.current.toFixed(0)} / ₪${dailyEarnings.goal}`;
        }
        if (dailyEarningsGoalBar) {
            dailyEarningsGoalBar.style.width = `${dailyEarnings.percentage}%`;
        }
        
        const weekly = data.weekly.deliveries;
        const weeklyGoalText = document.getElementById('weeklyGoalText');
        const weeklyGoalBar = document.getElementById('weeklyGoalBar');
        
        if (weeklyGoalText) weeklyGoalText.textContent = `${weekly.current} / ${weekly.goal}`;
        if (weeklyGoalBar) weeklyGoalBar.style.width = `${weekly.percentage}%`;
        
    } catch (error) {
        console.error('Goals error:', error);
    }
}

async function loadRanking() {
    try {
        const response = await fetch('/api/couriers/ranking', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (!response.ok) return;
        const data = await response.json();
        const myRank = data.myRank;
        
        const myRankElem = document.getElementById('myRank');
        const totalCouriersElem = document.getElementById('totalCouriers');
        const rankMedalElem = document.getElementById('rankMedal');
        
        if (myRankElem) myRankElem.textContent = myRank.rank;
        if (totalCouriersElem) totalCouriersElem.textContent = myRank.totalCouriers;
        
        if (rankMedalElem) {
            const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
            rankMedalElem.textContent = medals[myRank.rank] || '🏅';
        }
        
        const topCouriersListElem = document.getElementById('topCouriersList');
        if (topCouriersListElem && data.topCouriers) {
            const listHTML = data.topCouriers.map(c => `
                <div class="flex justify-between ${c.isMe ? 'text-emerald-400' : ''}">
                    <span>${c.rank === 1 ? '🥇' : c.rank === 2 ? '🥈' : c.rank === 3 ? '🥉' : c.rank}. ${c.name}</span>
                    <span>${c.monthDeliveries}</span>
                </div>
            `).join('');
            topCouriersListElem.innerHTML = listHTML;
        }
        
    } catch (error) {
        console.error('Ranking error:', error);
    }
}

async function loadEarningsProjection() {
    try {
        const response = await fetch('/api/couriers/earnings-projection', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (!response.ok) return;
        const data = await response.json();
        
        const currentMonthEarningsElem = document.getElementById('currentMonthEarnings');
        const currentMonthDaysElem = document.getElementById('currentMonthDays');
        const dailyRateElem = document.getElementById('dailyRate');
        const projectedEarningsElem = document.getElementById('projectedEarnings');
        
        if (currentMonthEarningsElem) {
            currentMonthEarningsElem.textContent = `₪${data.currentMonth.total.toLocaleString()}`;
        }
        if (currentMonthDaysElem) {
            currentMonthDaysElem.textContent = `${data.currentMonth.daysElapsed} ימים`;
        }
        if (dailyRateElem) {
            dailyRateElem.textContent = `₪${data.projection.dailyRate.toLocaleString()}`;
        }
        if (projectedEarningsElem) {
            projectedEarningsElem.textContent = `₪${data.projection.projectedTotal.toLocaleString()}`;
        }
        
        if (data.bestDay.date) {
            const date = new Date(data.bestDay.date);
            const bestDayEarningsElem = document.getElementById('bestDayEarnings');
            const bestDayDateElem = document.getElementById('bestDayDate');
            const bestDayDeliveriesElem = document.getElementById('bestDayDeliveries');
            
            if (bestDayEarningsElem) {
                bestDayEarningsElem.textContent = `₪${data.bestDay.earnings.toLocaleString()}`;
            }
            if (bestDayDateElem) {
                bestDayDateElem.textContent = date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
            }
            if (bestDayDeliveriesElem) {
                bestDayDeliveriesElem.textContent = `${data.bestDay.deliveries} משלוחים`;
            }
        }
        
    } catch (error) {
        console.error('Earnings projection error:', error);
    }
}

async function loadPerformanceMetrics() {
    try {
        const response = await fetch('/api/couriers/performance-metrics', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (!response.ok) return;
        const data = await response.json();
        
        const avgTimeElem = document.getElementById('avgTime');
        const fastestTimeElem = document.getElementById('fastestTime');
        
        if (avgTimeElem) avgTimeElem.textContent = `${data.timing.avgTime} דק'`;
        if (fastestTimeElem) fastestTimeElem.textContent = `${data.timing.fastestTime} דק'`;
        
        const dist = data.distribution;
        
        const morningDelElem = document.getElementById('morningDeliveries');
        const morningPercElem = document.getElementById('morningPercentage');
        if (morningDelElem) morningDelElem.textContent = dist.morning.deliveries;
        if (morningPercElem) morningPercElem.textContent = `${dist.morning.percentage}%`;
        
        const noonDelElem = document.getElementById('noonDeliveries');
        const noonPercElem = document.getElementById('noonPercentage');
        if (noonDelElem) noonDelElem.textContent = dist.noon.deliveries;
        if (noonPercElem) noonPercElem.textContent = `${dist.noon.percentage}%`;
        
        const eveningDelElem = document.getElementById('eveningDeliveries');
        const eveningPercElem = document.getElementById('eveningPercentage');
        if (eveningDelElem) eveningDelElem.textContent = dist.evening.deliveries;
        if (eveningPercElem) eveningPercElem.textContent = `${dist.evening.percentage}%`;
        
        const nightDelElem = document.getElementById('nightDeliveries');
        const nightPercElem = document.getElementById('nightPercentage');
        if (nightDelElem) nightDelElem.textContent = dist.night.deliveries;
        if (nightPercElem) nightPercElem.textContent = `${dist.night.percentage}%`;
        
    } catch (error) {
        console.error('Performance metrics error:', error);
    }
}

setInterval(() => {
    if (courierToken) {
        loadAdvancedDashboard();
    }
}, 60000);

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
            loadAdvancedDashboard();
            switchOrdersView('active');
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
// MY ORDERS
// ==========================================

async function loadMyOrders() {
    try {
        const response = await fetch('/api/couriers/my-orders', {
            headers: { 'Authorization': `Bearer ${courierToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
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
            loadAdvancedDashboard();
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
            loadAdvancedDashboard();
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

// ==========================================
// COURIER.JS - HISTORY POPUP FIX
// Add these functions to courier.js
// ==========================================

// ✅ REPLACE the displayOrderHistory function (around line 862):

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
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
             onclick='showOrderHistoryDetails(${JSON.stringify(order).replace(/'/g, "&#39;")})'>
            <div class="flex justify-between items-center mb-2">
                <p class="font-bold">${order.order_number}</p>
                <p class="text-emerald-400 font-bold">+₪${order.courier_payout}</p>
            </div>
            <p class="text-xs text-slate-400">${new Date(order.delivered_at).toLocaleDateString('he-IL')}</p>
            <p class="text-xs text-slate-400">${order.distance_km} ק"מ</p>
            <p class="text-xs text-blue-400 mt-2">👆 לחץ לפרטים מלאים</p>
        </div>
    `).join('');
}

// ✅ ADD this NEW function after displayOrderHistory:

function showOrderHistoryDetails(order) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    const commission = order.price - order.courier_payout;
    const commissionPercent = ((commission / order.price) * 100).toFixed(0);
    
    modal.innerHTML = `
        <div class="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full border border-slate-700">
            <div class="flex justify-between items-start mb-6">
                <div>
                    <h2 class="text-2xl font-bold mb-2">${order.order_number}</h2>
                    <span class="px-3 py-1 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/50">
                        ✅ נמסר
                    </span>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-4xl hover:text-red-500">&times;</button>
            </div>
            
            <div class="space-y-4">
                <!-- Pickup Address -->
                <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p class="font-bold text-blue-400 mb-2">📤 כתובת איסוף</p>
                    <p class="text-slate-200">${order.pickup_address}</p>
                </div>
                
                <!-- Delivery Address -->
                <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <p class="font-bold text-emerald-400 mb-2">📥 כתובת מסירה</p>
                    <p class="text-slate-200">${order.delivery_address}</p>
                </div>
                
                <!-- Distance -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <p class="font-bold mb-2">📏 מרחק</p>
                    <p class="text-2xl font-bold text-blue-400">${order.distance_km} ק"מ</p>
                </div>
                
                <!-- Money Breakdown -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <p class="font-bold mb-3">💰 פירוט כספי</p>
                    <div class="space-y-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-slate-400">מחיר מלא:</span>
                            <span class="font-bold">₪${order.price}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-slate-400">עמלת חברה (${commissionPercent}%):</span>
                            <span class="font-bold text-red-400">-₪${commission.toFixed(2)}</span>
                        </div>
                        <div class="h-px bg-slate-600 my-2"></div>
                        <div class="flex justify-between items-center">
                            <span class="font-bold text-lg">הרווחת:</span>
                            <span class="font-bold text-2xl text-emerald-400">₪${order.courier_payout}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Dates -->
                <div class="bg-slate-700 rounded-lg p-4">
                    <p class="font-bold mb-2">📅 תאריכים</p>
                    <div class="space-y-1 text-sm">
                        <p class="text-slate-400">נתפס: ${new Date(order.taken_at).toLocaleString('he-IL')}</p>
                        ${order.picked_at ? `<p class="text-slate-400">נאסף: ${new Date(order.picked_at).toLocaleString('he-IL')}</p>` : ''}
                        <p class="text-slate-400">נמסר: ${new Date(order.delivered_at).toLocaleString('he-IL')}</p>
                    </div>
                </div>
            </div>
            
            <div class="mt-6">
                <button onclick="this.closest('.fixed').remove()" 
                        class="w-full bg-slate-700 hover:bg-slate-600 font-bold py-3 rounded-lg">
                    סגור
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// ✅ REPLACE the logout function (search for "function logout"):

function logout() {
    if (confirm('האם אתה בטוח שברצונך להתנתק?')) {
        localStorage.clear();
        window.location.href = '/';  // ✅ Redirect to home page!
    }
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
// TABS - ✅ עדכון!
// ==========================================

function switchCourierTab(tab) {
    document.querySelectorAll('[id^="tab"]').forEach(t => {
        t.className = 'courier-tab-inactive px-3 py-3 rounded-lg text-sm font-bold transition-all';
    });
    document.querySelectorAll('.courier-tab-content').forEach(t => t.classList.add('hidden'));
    
    const tabMap = {
        'stats': 'tabStats',
        'history': 'tabHistory',
        'earnings': 'tabEarnings'
    };
    
    document.getElementById(tabMap[tab]).className = 'courier-tab-active px-3 py-3 rounded-lg text-sm font-bold transition-all';
    document.getElementById(`${tab}Tab`).classList.remove('hidden');
    
    if (tab === 'stats') loadAdvancedDashboard();
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


