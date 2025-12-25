// ==========================================
// FLOATING PUSH NOTIFICATION BUTTON
// הוסף את הקובץ הזה לכל עמוד שצריך Push
// ==========================================

(function() {
  'use strict';

  // Don't show if already initialized
  if (window.pushButtonInitialized) return;
  window.pushButtonInitialized = true;

  // Check if user is logged in
  function isLoggedIn() {
    return !!(localStorage.getItem('customerToken') || localStorage.getItem('courierToken'));
  }

  // Get current permission status
  function getPermissionStatus() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  // Create floating button
  function createPushButton() {
    if (!isLoggedIn()) return; // Only show for logged-in users
    
    const permission = getPermissionStatus();
    
    // Don't show if unsupported
    if (permission === 'unsupported') return;
    
    // Create button container
    const container = document.createElement('div');
    container.id = 'pushNotificationButton';
    container.style.cssText = `
      position: fixed;
      top: 80px;
      left: 20px;
      z-index: 9998;
      direction: rtl;
    `;
    
    // Button HTML
    let buttonHTML = '';
    let buttonColor = '';
    let buttonText = '';
    let buttonIcon = '';
    
    if (permission === 'granted') {
      buttonColor = '#10b981'; // green
      buttonText = 'התראות פעילות';
      buttonIcon = '✅';
    } else if (permission === 'denied') {
      buttonColor = '#ef4444'; // red
      buttonText = 'התראות חסומות';
      buttonIcon = '🔕';
    } else {
      buttonColor = '#f59e0b'; // orange
      buttonText = 'אפשר התראות';
      buttonIcon = '🔔';
    }
    
    container.innerHTML = `
      <button id="pushBtn" style="
        background: ${buttonColor};
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 25px;
        font-weight: bold;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s;
        font-family: 'Heebo', sans-serif;
      ">
        <span style="font-size: 18px;">${buttonIcon}</span>
        <span>${buttonText}</span>
      </button>
    `;
    
    document.body.appendChild(container);
    
    // Add click handler
    const btn = document.getElementById('pushBtn');
    btn.addEventListener('click', handlePushClick);
    
    // Hover effect
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
    });
    
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
  }

  // Handle button click
  async function handlePushClick() {
    const permission = getPermissionStatus();
    
    if (permission === 'denied') {
      // Show instructions to enable in settings
      showInstructions();
      return;
    }
    
    if (permission === 'granted') {
      // Already enabled - show test notification
      showTestNotification();
      return;
    }
    
    // Request permission
    try {
      // Check if pushManager exists
      if (!window.pushManager) {
        console.error('pushManager not loaded');
        alert('⚠️ מערכת ההתראות לא נטענה. רענן את הדף ונסה שוב.');
        return;
      }
      
      // Get user info
      const customerToken = localStorage.getItem('customerToken');
      const courierToken = localStorage.getItem('courierToken');
      const userType = customerToken ? 'customer' : 'courier';
      const userData = JSON.parse(localStorage.getItem(`${userType}Data`) || '{}');
      
      if (!userData.id) {
        alert('⚠️ לא נמצא מזהה משתמש. התחבר מחדש.');
        return;
      }
      
      // Show loading
      const btn = document.getElementById('pushBtn');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<span style="font-size: 18px;">⏳</span><span>מאפשר...</span>';
      btn.disabled = true;
      
      // Initialize push
      const result = await window.pushManager.init(userType, userData.id);
      
      if (result) {
        // Success!
        btn.style.background = '#10b981';
        btn.innerHTML = '<span style="font-size: 18px;">✅</span><span>התראות פעילות</span>';
        btn.disabled = false;
        
        // Show success message
        showSuccessMessage();
        
        // Send test notification
        setTimeout(() => {
          showTestNotification();
        }, 1000);
      } else {
        // Failed
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        alert('❌ לא הצלחנו להפעיל התראות. נסה שוב.');
      }
    } catch (error) {
      console.error('Push enable error:', error);
      alert('❌ שגיאה: ' + error.message);
      
      // Reset button
      const btn = document.getElementById('pushBtn');
      btn.disabled = false;
      location.reload(); // Reload to reset state
    }
  }

  // Show test notification
  function showTestNotification() {
    if (Notification.permission === 'granted') {
      new Notification('M.M.H Delivery ✅', {
        body: 'ההתראות פעילות ועובדות!',
        icon: '/assets/logo.png',
        badge: '/assets/badge.png',
        vibrate: [200, 100, 200]
      });
    }
  }

  // Show success message
  function showSuccessMessage() {
    const msg = document.createElement('div');
    msg.style.cssText = `
      position: fixed;
      top: 140px;
      left: 20px;
      background: #10b981;
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 9999;
      font-weight: bold;
      animation: slideIn 0.3s ease-out;
    `;
    msg.textContent = '🎉 התראות הופעלו בהצלחה!';
    
    document.body.appendChild(msg);
    
    setTimeout(() => {
      msg.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => msg.remove(), 300);
    }, 3000);
  }

  // Show instructions for denied permission
  function showInstructions() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isChrome = /Chrome/.test(navigator.userAgent);
    
    let instructions = '';
    
    if (isIOS) {
      instructions = `
        📱 להפעלת התראות ב-iPhone:
        
        1. הגדרות → Safari
        2. התראות → הפעל
        3. רענן את הדף
        
        או:
        
        אם האפליקציה מותקנת:
        הגדרות → M.M.H Delivery → התראות → הפעל
      `;
    } else if (isChrome) {
      instructions = `
        🔔 להפעלת התראות ב-Chrome:
        
        1. לחץ על 🔒 בסרגל הכתובת
        2. הרשאות → התראות
        3. שנה ל-"אפשר"
        4. רענן את הדף
      `;
    } else {
      instructions = `
        🔔 להפעלת התראות:
        
        1. לחץ על הגדרות האתר (ליד הכתובת)
        2. הרשאות → התראות → אפשר
        3. רענן את הדף
      `;
    }
    
    alert(instructions);
  }

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(-100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(-100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPushButton);
  } else {
    createPushButton();
  }

  // Update button when permission changes
  setInterval(() => {
    const btn = document.getElementById('pushBtn');
    if (!btn) return;
    
    const permission = getPermissionStatus();
    
    if (permission === 'granted' && !btn.textContent.includes('פעילות')) {
      btn.style.background = '#10b981';
      btn.innerHTML = '<span style="font-size: 18px;">✅</span><span>התראות פעילות</span>';
    }
  }, 2000);

  console.log('✅ Push notification button loaded');
})();
