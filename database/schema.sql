-- WhatsApp Delivery Bot Database Schema
-- PostgreSQL Database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== USERS & AUTH ====================

-- מנהלים של המערכת
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) DEFAULT 'admin', -- admin, super_admin
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- שליחים
CREATE TABLE couriers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL, -- מספר הטלפון = מזהה בוואטסאפ
    whatsapp_id VARCHAR(50), -- WhatsApp User ID
    email VARCHAR(255),
    id_number VARCHAR(20), -- תעודת זהות
    vehicle_type VARCHAR(50), -- אופנוע, רכב, אופניים
    vehicle_number VARCHAR(20),
    bank_account JSONB, -- {bank_name, branch, account_number, owner_name}
    base_rate DECIMAL(10,2) DEFAULT 15.00, -- תעריף בסיסי למשלוח
    bonus_rate DECIMAL(10,2) DEFAULT 5.00, -- בונוס למשלוח מהיר
    rating DECIMAL(3,2) DEFAULT 5.00,
    total_deliveries INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== DELIVERIES ====================

-- משלוחים
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_number VARCHAR(20) UNIQUE NOT NULL, -- מספר משלוח ייחודי קריא
    
    -- פרטי איסוף
    pickup_name VARCHAR(100) NOT NULL,
    pickup_phone VARCHAR(20) NOT NULL,
    pickup_address TEXT NOT NULL,
    pickup_city VARCHAR(100) NOT NULL,
    pickup_notes TEXT,
    pickup_time_from TIMESTAMP,
    pickup_time_to TIMESTAMP,
    
    -- פרטי מסירה
    dropoff_name VARCHAR(100) NOT NULL,
    dropoff_phone VARCHAR(20) NOT NULL,
    dropoff_address TEXT NOT NULL,
    dropoff_city VARCHAR(100) NOT NULL,
    dropoff_notes TEXT,
    dropoff_time_from TIMESTAMP,
    dropoff_time_to TIMESTAMP,
    
    -- פרטי החבילה
    package_description TEXT,
    package_size VARCHAR(20) DEFAULT 'medium', -- small, medium, large, xlarge
    package_weight DECIMAL(10,2), -- ק"ג
    is_fragile BOOLEAN DEFAULT false,
    requires_signature BOOLEAN DEFAULT false,
    cash_on_delivery DECIMAL(10,2) DEFAULT 0, -- גביית מזומן
    
    -- תמחור
    base_price DECIMAL(10,2) NOT NULL,
    express_fee DECIMAL(10,2) DEFAULT 0,
    distance_fee DECIMAL(10,2) DEFAULT 0,
    total_price DECIMAL(10,2) NOT NULL,
    courier_payment DECIMAL(10,2), -- הסכום לשליח
    
    -- סטטוס ומעקב
    status VARCHAR(30) DEFAULT 'pending',
    -- pending, published, assigned, picked_up, in_transit, delivered, cancelled, failed
    
    priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent
    
    -- קשרים
    courier_id UUID REFERENCES couriers(id),
    assigned_at TIMESTAMP,
    created_by UUID REFERENCES admins(id),
    
    -- זמנים
    published_at TIMESTAMP,
    picked_up_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- WhatsApp
    whatsapp_message_id VARCHAR(100), -- ID ההודעה בקבוצה
    whatsapp_group_id VARCHAR(100),
    
    -- מטא-דאטה
    estimated_distance DECIMAL(10,2), -- ק"מ
    actual_distance DECIMAL(10,2),
    customer_rating INTEGER, -- 1-5
    customer_feedback TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- היסטוריית סטטוסים
CREATE TABLE delivery_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL,
    changed_by_type VARCHAR(20), -- admin, courier, system
    changed_by_id UUID,
    notes TEXT,
    location JSONB, -- {lat, lng, address}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== PAYMENTS ====================

-- תשלומים לשליחים
CREATE TABLE courier_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_id UUID REFERENCES couriers(id),
    
    -- תקופת חישוב
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- סיכום
    total_deliveries INTEGER DEFAULT 0,
    total_distance DECIMAL(10,2) DEFAULT 0,
    base_earnings DECIMAL(10,2) DEFAULT 0,
    bonus_earnings DECIMAL(10,2) DEFAULT 0,
    tips DECIMAL(10,2) DEFAULT 0,
    deductions DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- סטטוס תשלום
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, paid, cancelled
    approved_by UUID REFERENCES admins(id),
    approved_at TIMESTAMP,
    paid_at TIMESTAMP,
    payment_reference VARCHAR(100),
    
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- פירוט משלוחים לתשלום
CREATE TABLE payment_delivery_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID REFERENCES courier_payments(id) ON DELETE CASCADE,
    delivery_id UUID REFERENCES deliveries(id),
    amount DECIMAL(10,2) NOT NULL,
    bonus DECIMAL(10,2) DEFAULT 0,
    tip DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== WHATSAPP ====================

-- קבוצות וואטסאפ
CREATE TABLE whatsapp_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id VARCHAR(100) UNIQUE NOT NULL, -- WhatsApp Group ID
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'couriers', -- couriers, admins, customers
    is_active BOOLEAN DEFAULT true,
    member_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- לוג הודעות
CREATE TABLE whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id VARCHAR(100) UNIQUE, -- WhatsApp Message ID
    group_id VARCHAR(100),
    sender_phone VARCHAR(20),
    sender_name VARCHAR(100),
    message_type VARCHAR(30), -- text, interactive, template, image
    content TEXT,
    direction VARCHAR(10), -- inbound, outbound
    delivery_id UUID REFERENCES deliveries(id),
    status VARCHAR(20), -- sent, delivered, read, failed
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- תגובות לכפתורים
CREATE TABLE button_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id VARCHAR(100),
    delivery_id UUID REFERENCES deliveries(id),
    courier_id UUID REFERENCES couriers(id),
    button_id VARCHAR(50), -- take_delivery, collected, delivered
    response_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    was_first BOOLEAN DEFAULT false, -- האם היה הראשון ללחוץ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SETTINGS & CONFIG ====================

-- הגדרות מערכת
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES admins(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- אזורי משלוח ותמחור
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    cities TEXT[], -- רשימת ערים באזור
    base_price DECIMAL(10,2) NOT NULL,
    price_per_km DECIMAL(10,2) DEFAULT 2.00,
    courier_rate DECIMAL(10,2), -- תעריף לשליח
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- תבניות הודעות
CREATE TABLE message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- new_delivery, assignment, reminder, status_update
    language VARCHAR(10) DEFAULT 'he',
    content TEXT NOT NULL,
    variables TEXT[], -- משתנים שניתן להחליף
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== ANALYTICS ====================

-- סטטיסטיקות יומיות
CREATE TABLE daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE UNIQUE NOT NULL,
    total_deliveries INTEGER DEFAULT 0,
    completed_deliveries INTEGER DEFAULT 0,
    cancelled_deliveries INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    total_courier_payments DECIMAL(10,2) DEFAULT 0,
    average_delivery_time INTEGER, -- דקות
    average_rating DECIMAL(3,2),
    active_couriers INTEGER DEFAULT 0,
    new_couriers INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==================== INDEXES ====================

CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_deliveries_courier ON deliveries(courier_id);
CREATE INDEX idx_deliveries_created ON deliveries(created_at);
CREATE INDEX idx_deliveries_published ON deliveries(published_at);
CREATE INDEX idx_deliveries_number ON deliveries(delivery_number);

CREATE INDEX idx_couriers_phone ON couriers(phone);
CREATE INDEX idx_couriers_status ON couriers(status);

CREATE INDEX idx_payments_courier ON courier_payments(courier_id);
CREATE INDEX idx_payments_period ON courier_payments(period_start, period_end);

CREATE INDEX idx_messages_delivery ON whatsapp_messages(delivery_id);
CREATE INDEX idx_messages_created ON whatsapp_messages(created_at);

CREATE INDEX idx_button_responses_delivery ON button_responses(delivery_id);

-- ==================== INITIAL DATA ====================

-- תבניות הודעות ברירת מחדל
INSERT INTO message_templates (name, type, content, variables) VALUES
('משלוח חדש', 'new_delivery', 
'🚚 *משלוח חדש!* #{{delivery_number}}

📍 *איסוף:* {{pickup_city}}
{{pickup_address}}

📍 *יעד:* {{dropoff_city}}
{{dropoff_address}}

📦 {{package_description}}
💰 תשלום לשליח: ₪{{courier_payment}}

⏰ {{time_window}}', 
ARRAY['delivery_number', 'pickup_city', 'pickup_address', 'dropoff_city', 'dropoff_address', 'package_description', 'courier_payment', 'time_window']),

('הקצאה לשליח', 'assignment',
'✅ *המשלוח שלך!* #{{delivery_number}}

📞 *איסוף:*
{{pickup_name}}: {{pickup_phone}}
📍 {{pickup_address}}, {{pickup_city}}
{{pickup_notes}}

📞 *מסירה:*
{{dropoff_name}}: {{dropoff_phone}}
📍 {{dropoff_address}}, {{dropoff_city}}
{{dropoff_notes}}

📦 {{package_description}}
💵 גבייה: ₪{{cash_on_delivery}}
💰 תשלום: ₪{{courier_payment}}',
ARRAY['delivery_number', 'pickup_name', 'pickup_phone', 'pickup_address', 'pickup_city', 'pickup_notes', 'dropoff_name', 'dropoff_phone', 'dropoff_address', 'dropoff_city', 'dropoff_notes', 'package_description', 'cash_on_delivery', 'courier_payment']),

('סיכום יומי', 'daily_summary',
'📊 *סיכום יומי - {{date}}*

✅ משלוחים שהושלמו: {{completed}}
❌ משלוחים שבוטלו: {{cancelled}}
⏳ ממוצע זמן משלוח: {{avg_time}} דקות

💰 *הרווחת היום:* ₪{{earnings}}
🚚 סה"כ החודש: ₪{{monthly_total}}',
ARRAY['date', 'completed', 'cancelled', 'avg_time', 'earnings', 'monthly_total']);

-- הגדרות מערכת ברירת מחדל
INSERT INTO system_settings (key, value, description) VALUES
('business_hours', '{"start": "08:00", "end": "22:00", "days": [0,1,2,3,4,5]}', 'שעות פעילות העסק'),
('default_courier_rate', '{"base": 15, "per_km": 2, "express_bonus": 10}', 'תעריף ברירת מחדל לשליחים'),
('auto_cancel_minutes', '30', 'דקות עד ביטול אוטומטי של משלוח לא נלקח'),
('whatsapp_config', '{"phone_number_id": "", "business_account_id": "", "access_token": ""}', 'הגדרות WhatsApp API');
