// ==========================================
// CUSTOMER AUTHENTICATION CHECK
// ==========================================
// This script runs BEFORE the order page loads
// to ensure the customer is logged in

(function() {
    // Check if customer token exists
    const customerToken = localStorage.getItem('customerToken');
    const customerData = localStorage.getItem('customerData');

    if (!customerToken || !customerData) {
        // Not logged in - redirect to login page
        console.log('⚠️ Customer not authenticated - redirecting to login');
        
        // Save current URL to return after login
        const returnUrl = window.location.pathname + window.location.search;
        window.location.href = `/customer/login.html?return=${encodeURIComponent(returnUrl)}`;
        
        // Stop page execution
        throw new Error('Authentication required');
    }

    // Parse customer data
    let customer;
    try {
        customer = JSON.parse(customerData);
    } catch (e) {
        console.error('Invalid customer data - clearing and redirecting');
        localStorage.removeItem('customerToken');
        localStorage.removeItem('customerData');
        window.location.href = '/customer/login.html';
        throw new Error('Invalid customer data');
    }

    // Verify token is still valid by making a quick API call
    fetch('/api/customers/profile', {
        headers: {
            'Authorization': `Bearer ${customerToken}`
        }
    })
    .then(response => {
        if (!response.ok) {
            // Token expired or invalid
            console.warn('⚠️ Token invalid - redirecting to login');
            localStorage.removeItem('customerToken');
            localStorage.removeItem('customerData');
            window.location.href = '/customer/login.html';
        } else {
            // Token valid - show welcome message
            console.log('✅ Customer authenticated:', customer.name);
            
            // Optional: Show customer name in UI if element exists
            const welcomeEl = document.getElementById('customerWelcome');
            if (welcomeEl) {
                welcomeEl.textContent = `שלום ${customer.name}`;
            }
        }
    })
    .catch(error => {
        console.error('Auth check error:', error);
        // Network error - allow to continue but warn
        console.warn('⚠️ Could not verify token - proceeding anyway');
    });

    // Add logout function to window
    window.customerLogout = function() {
        if (confirm('האם אתה בטוח שברצונך להתנתק?')) {
            localStorage.removeItem('customerToken');
            localStorage.removeItem('customerData');
            window.location.href = '/';
        }
    };

    console.log('✅ Authentication check passed');
})();
