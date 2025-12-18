// Get order number from URL
const urlParts = window.location.pathname.split('/');
const orderNumber = urlParts[urlParts.length - 1];

document.getElementById('trackingNumber').textContent = orderNumber;

async function loadTracking() {
    try {
        const response = await fetch(`/api/orders/track/${orderNumber}`);
        
        if (response.ok) {
            const data = await response.json();
            displayTracking(data.order);
        } else {
            showError('הזמנה לא נמצאה');
        }
    } catch (error) {
        console.error('Tracking error:', error);
        showError('שגיאה בטעינת מידע');
    }
}

function displayTracking(order) {
    // Display order tracking info
    const content = `
        <div class="bg-slate-800 rounded-2xl p-6 border border-slate-700">
            <h3 class="text-xl font-bold mb-4">סטטוס: ${getStatusBadge(order.status)}</h3>
            <!-- Add more tracking details here -->
        </div>
    `;
    
    document.getElementById('trackingContent').innerHTML = content;
}

function getStatusBadge(status) {
    const badges = {
        'new': '🆕 חדש',
        'published': '📢 מפורסם',
        'taken': '🔵 נתפס',
        'picked': '📦 נאסף',
        'delivered': '✅ נמסר',
        'cancelled': '❌ בוטל'
    };
    return badges[status] || status;
}

function showError(message) {
    document.getElementById('trackingContent').innerHTML = `
        <div class="bg-red-500/20 border border-red-500 rounded-xl p-6 text-center">
            <div class="text-6xl mb-4">❌</div>
            <p class="text-xl font-bold">${message}</p>
        </div>
    `;
}

loadTracking();