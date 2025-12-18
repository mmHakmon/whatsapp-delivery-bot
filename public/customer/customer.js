// ==========================================
// M.M.H DELIVERY - CUSTOMER APP
// ==========================================

let currentStep = 1;
let currentPricing = null;
let createdOrderNumber = null;

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

        // For demo - replace with actual API call
        // This would normally require admin token
        // In production, create a public endpoint for price calculation
        
        // Simulate distance calculation
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Mock pricing
        const mockDistance = (Math.random() * 20 + 5).toFixed(2);
        currentPricing = calculateMockPricing(parseFloat(mockDistance), vehicleType);
        
        // Display price
        document.getElementById('distance').textContent = `${currentPricing.distanceKm} ק"מ`;
        document.getElementById('priceBeforeVat').textContent = `₪${currentPricing.priceBeforeVat}`;
        document.getElementById('vat').textContent = `₪${currentPricing.vat}`;
        document.getElementById('totalPrice').textContent = `₪${currentPricing.totalPrice}`;
        
        // Build summary
        buildOrderSummary(formData);
        
        // Move to confirmation
        nextStep();
    } catch (error) {
        console.error('Calculate error:', error);
        showAlert('❌ שגיאה בחישוב מרחק. אנא בדוק את הכתובות.', 'error');
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
        // For demo - this would need authentication in production
        // You should create a public endpoint for customer orders
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

function trackOrder() {
    if (createdOrderNumber) {
        window.location.href = `/track/${createdOrderNumber}`;
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
            card.classList.remove('border-purple-500');
            card.classList.add('border-slate-600');
        });
        option.querySelector('.vehicle-card').classList.remove('border-slate-600');
        option.querySelector('.vehicle-card').classList.add('border-purple-500');
    });
});

// Initialize
updateStepDisplay();