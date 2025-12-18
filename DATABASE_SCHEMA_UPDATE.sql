-- =====================================
-- CUSTOMERS TABLE UPDATE
-- =====================================

-- Add columns for customer profile if not exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_name VARCHAR(255);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_type VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_payment_method VARCHAR(50) DEFAULT 'cash';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_notifications BOOLEAN DEFAULT TRUE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_notifications BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT NOW();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMP;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- =====================================
-- CUSTOMER STATISTICS (calculated on the fly, but keeping record)
-- =====================================

COMMENT ON TABLE customers IS 'Customer information and profile data';
