// ==========================================
// M.M.H DELIVERY - CUSTOMER APP
// ✅ FIXED VERSION with Google Maps Autocomplete
// ==========================================

let currentStep = 1;
let currentPricing = null;
let createdOrderNumber = null;

// ✅ NEW: Google Maps variables
let autocompletePickup = null;
let autocompleteDelivery = null;
let selectedPickupLocation = null;
let selectedDeliveryLocation = null;
let googleMapsLoaded = false;

// ==========================================
// ✅ NEW: GOOGLE MAPS API LOADER
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

// ✅ NEW: Initialize Google Places Autocomplete
function initGooglePlacesAutocomplete() {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
        console.error('❌ Google Maps Places API not loaded!');
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
                pickupInput.value = selectedPickupLocation.address;
                console.log('✅ Pickup location selected:', selectedPickupLocation);
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
                deliveryInput.value = selectedDeliveryLocation.address;
                console.log('✅ Delivery location selected:', selectedDeliveryLocation);
            }
        });
    } catch (error) {
        console.error('❌ Error initializing delivery autocomplete:', error);
    }
    
    console.log('✅ Google Places Autocomplete initialized successfully');
}

// ==========================================
// STEP NAVIGATION
// ==========================================

function nextStep() {
    // Validate current step
    if (!validateStep(currentStep)) {
        return;
    }

    currentStep++;
    updateStepDisplay();
}

function prevStep() {
    currentStep--;
    updateStepDisplay();
}

function updateStepDisplay() {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.add('hidden');
    });

    // Show current step
    const steps = ['senderStep', 'receiverStep', 'packageStep', 'confirmStep'];
    document.getElementById(steps[currentStep - 1]).classList.remove('hidden');

    // Update step indicators
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`step${i}`);
        if (i < currentStep) {
            stepEl.className = 'w-12 h-12 mx-auto rounded-full flex items-center justify-center text-2xl mb-2 bg-emerald-500';
        } else if (i === currentStep) {
            stepEl.className = 'step-active w-12 h-12 mx-auto rounded-full flex items-center justify-center text-2xl mb-2';
        } else {
            stepEl.className = 'step-inactive w-12 h-12 mx-auto rounded-full flex items-center justify-center text-2xl mb-2';
        }
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function validateStep(step) {
    if (step === 1) {
        const senderName = document.getElementById('senderName').value;
        const senderPhone = document.getElementById('senderPhone').value;
        const pickupAddress = document.getElementById('pickupAddress').value;

        if (!senderName || !senderPhone || !pickupAddress) {
            showAlert('❌ נא למלא את כל השדות החובה', 'error');
            return false;
        }

        if (!validatePhone(senderPhone)) {
            showAlert('❌ מספר טלפון לא תקין', 'error');
            return false;
        }
    }

    if (step === 2) {
        const receiverName = document.getElementById('receiverName').value;
        const receiverPhone = document.getElementById('receiverPhone').value;
        const deliveryAddress = document.getElementById('deliveryAddress').value;

        if (!receiverName || !receiverPhone || !deliveryAddress) {
            showAlert('❌ נא למלא את כל השדות החובה', 'error');
            return false;
        }

        if (!validatePhone(receiverPhone)) {
            showAlert('❌ מספר טלפון לא תקין', 'error');
            return false;
        }
    }

    return true;
}

function validatePhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 10 && cleaned.startsWith('0');
}

// ==========================================
// CALCULATE PRICE
// ==========================================

async function calculatePrice() {
    const pickupAddress = document.getElementById('pickupAddress').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value;
    const vehicleType = document.querySelector('input[name="vehicleType"]:checked').value;

    if (!pickupAddress || !deliveryAddress) {
        showAlert('❌ נא למלא כתובות איסוף ומסירה', 'error');
        return;
    }

    document.getElementById('loadingOverlay').classList.remove('hidden');

    try {
        const formData = {
            senderName: document.getElementById('senderName').value,
            senderPhone: document.getElementById('senderPhone').value,
            pickupAddress,
            pickupNotes: document.getElementById('pickupNotes').value,
            receiverName: document.getElementById('receiverName').value,
            receiverPhone: document.getElementById('receiverPhone').value,
            deliveryAddress,
            deliveryNotes: document.getElementById('deliveryNotes').value,
            packageDescription: document.getElementById('packageDescription').value,
            notes: document.getElementById('notes').value,
            vehicleType
        };

        // Call API to get real distance and pricing
        const response = await fetch('/api/orders/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pickupAddress,
                deliveryAddress,
                vehicleType
            })
        });

        if (response.ok) {
            const data = await response.json();
            currentPricing = data.pricing;
            
            // Display price
            document.getElementById('distance').textContent = `${currentPricing.distanceKm} ק"מ`;
            document.getElementById('priceBeforeVat').textContent = `₪${currentPricing.priceBeforeVat}`;
            document.getElementById('vat').textContent = `₪${currentPricing.vat}`;
            document.getElementById('totalPrice').textContent = `₪${currentPricing.totalPrice}`;
            
            // Build summary
            buildOrderSummary(formData);
            
            // Move to confirmation
            nextStep();
        } else {
            // Fallback to mock if API fails
            const mockDistance = (Math.random() * 20 + 5).toFixed(2);
            currentPricing = calculateMockPricing(parseFloat(mockDistance), vehicleType);
            
            document.getElementById('distance').textContent = `${currentPricing.distanceKm} ק"מ (משוערך)`;
            document.getElementById('priceBeforeVat').textContent = `₪${currentPricing.priceBeforeVat}`;
            document.getElementById('vat').textContent = `₪${currentPricing.vat}`;
            document.getElementById('totalPrice').textContent = `₪${currentPricing.totalPrice}`;
            
            buildOrderSummary(formData);
            nextStep();
            
            showAlert('⚠️ חישוב משוערך - המנהל יאשר מחיר סופי', 'info');
        }
    } catch (error) {
        console.error('Calculate error:', error);
        
        // Fallback to mock
        const mockDistance = (Math.random() * 20 + 5).toFixed(2);
        currentPricing = calculateMockPricing(parseFloat(mockDistance), vehicleType);
        
        document.getElementById('distance').textContent = `${currentPricing.distanceKm} ק"מ (משוערך)`;
        document.getElementById('priceBeforeVat').textContent = `₪${currentPricing.priceBeforeVat}`;
        document.getElementById('vat').textContent = `₪${currentPricing.vat}`;
        document.getElementById('totalPrice').textContent = `₪${currentPricing.totalPrice}`;
        
        const formData = {
            senderName: document.getElementById('senderName').value,
            senderPhone: document.getElementById('senderPhone').value,
            pickupAddress,
            pickupNotes: document.getElementById('pickupNotes').value,
            receiverName: document.getElementById('receiverName').value,
            receiverPhone: document.getElementById('receiverPhone').value,
            deliveryAddress,
            deliveryNotes: document.getElementById('deliveryNotes').value,
            packageDescription: document.getElementById('packageDescription').value,
            notes: document.getElementById('notes').value,
            vehicleType
        };
        
        buildOrderSummary(formData);
        nextStep();
        
        showAlert('⚠️ חישוב משוערך - המנהל יאשר מחיר סופי', 'info');
    } finally {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
}

function calculateMockPricing(distanceKm, vehicleType) {
    const pricing = {
        motorcycle: { base: 70, perKm: 2.5 },
        car: { base: 75, perKm: 2.5 },
        van: { base: 120, perKm: 3.0 },
        truck: { base: 200, perKm: 4.0 }
    };

    const vehicle = pricing[vehicleType];
    const freeKm = 1;
    const billableKm = Math.max(0, distanceKm - freeKm);
    const priceBeforeVat = vehicle.base + (billableKm * vehicle.perKm);
    const vat = priceBeforeVat * 0.18;
    const totalPrice = Math.ceil(priceBeforeVat + vat);

    return {
        distanceKm,
        vehicleType,
        priceBeforeVat: parseFloat(priceBeforeVat.toFixed(2)),
        vat: parseFloat(vat.toFixed(2)),
        totalPrice
    };
}

function buildOrderSummary(formData) {
    const vehicleNames = {
        motorcycle: '🏍️ אופנוע',
        car: '🚗 רכב פרטי',
        van: '🚐 מסחרית',
        truck: '🚚 משאית'
    };

    const summary = `
        <div class="border-b border-slate-700 pb-3 mb-3">
            <p class="font-bold text-purple-400 mb-2">📤 שולח</p>
            <p><strong>${formData.senderName}</strong></p>
            <p class="text-slate-400">${formData.senderPhone}</p>
            <p class="text-slate-400">${formData.pickupAddress}</p>
            ${formData.pickupNotes ? `<p class="text-xs text-slate-500 mt-1">📝 ${formData.pickupNotes}</p>` : ''}
        </div>
        <div class="border-b border-slate-700 pb-3 mb-3">
            <p class="font-bold text-blue-400 mb-2">📥 מקבל</p>
            <p><strong>${formData.receiverName}</strong></p>
            <p class="text-slate-400">${formData.receiverPhone}</p>
            <p class="text-slate-400">${formData.deliveryAddress}</p>
            ${formData.deliveryNotes ? `<p class="text-xs text-slate-500 mt-1">📝 ${formData.deliveryNotes}</p>` : ''}
        </div>
        <div>
            <p class="font-bold text-emerald-400 mb-2">📦 פרטי חבילה</p>
            <p class="text-slate-400">סוג רכב: ${vehicleNames[formData.vehicleType]}</p>
            ${formData.packageDescription ? `<p class="text-slate-400">תיאור: ${formData.packageDescription}</p>` : ''}
            ${formData.notes ? `<p class="text-xs text-slate-500 mt-1">📝 ${formData.notes}</p>` : ''}
        </div>
    `;

    document.getElementById('orderSummary').innerHTML = summary;
}

// ==========================================
// CREATE ORDER
// ==========================================

document.getElementById('orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentPricing) {
        showAlert('❌ נא לחשב מחיר תחילה', 'error');
        return;
    }

    if (!confirm(`האם לאשר הזמנה בסך ₪${currentPricing.totalPrice}?`)) {
        return;
    }

    document.getElementById('loadingOverlay').classList.remove('hidden');

    const formData = {
        senderName: document.getElementById('senderName').value,
        senderPhone: document.getElementById('senderPhone').value,
        pickupAddress: document.getElementById('pickupAddress').value,
        pickupNotes: document.getElementById('pickupNotes').value,
        receiverName: document.getElementById('receiverName').value,
        receiverPhone: document.getElementById('receiverPhone').value,
        deliveryAddress: document.getElementById('deliveryAddress').value,
        deliveryNotes: document.getElementById('deliveryNotes').value,
        packageDescription: document.getElementById('packageDescription').value,
        notes: document.getElementById('notes').value,
        vehicleType: document.querySelector('input[name="vehicleType"]:checked').value
    };

    try {
        const response = await fetch('/api/orders/public', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (response.ok) {
            const data = await response.json();
            createdOrderNumber = data.order.order_number;
            
            document.getElementById('orderNumber').textContent = createdOrderNumber;
            document.getElementById('successModal').classList.remove('hidden');
        } else {
            const data = await response.json();
            showAlert('❌ ' + (data.error || 'לא הצלחנו ליצור הזמנה'), 'error');
        }
    } catch (error) {
        console.error('Create order error:', error);
        showAlert('❌ שגיאת תקשורת', 'error');
    } finally {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
});

// ✅ FIXED: Redirect to dashboard if logged in
function trackOrder() {
    if (createdOrderNumber) {
        // Check if user is logged in
        const customerToken = localStorage.getItem('customerToken');
        if (customerToken) {
            // ✅ Logged in → go to dashboard
            window.location.href = '/customer/dashboard.html';
        } else {
            // ✅ Not logged in → go to track page
            window.location.href = `/customer/track.html`;
        }
    }
}

// ✅ NEW: Function to go directly to dashboard
function goToDashboard() {
    const customerToken = localStorage.getItem('customerToken');
    if (customerToken) {
        window.location.href = '/customer/dashboard.html';
    } else {
        window.location.href = '/';
    }
}

// ==========================================
// UTILITIES
// ==========================================

function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-4 rounded-xl shadow-2xl z-50 font-bold ${
        type === 'error' ? 'bg-red-500' : 'bg-blue-500'
    } text-white`;
    alert.textContent = message;
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 4000);
}

// Vehicle selection
document.querySelectorAll('.vehicle-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('.vehicle-card').forEach(card => {
            card.classList.remove('border-purple-500', 'bg-purple-500/20');
            card.classList.add('border-slate-600');
        });
        const card = option.querySelector('.vehicle-card');
        card.classList.remove('border-slate-600');
        card.classList.add('border-purple-500', 'bg-purple-500/20');
    });
});

// ✅ Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    updateStepDisplay();
    
    // Load Google Maps API
    loadGoogleMapsAPI()
        .then(() => {
            setTimeout(() => {
                initGooglePlacesAutocomplete();
            }, 100);
        })
        .catch(err => {
            console.error('Failed to initialize Google Maps:', err);
        });
});
