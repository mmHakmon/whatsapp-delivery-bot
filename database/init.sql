-- ==========================================
-- M.M.H DELIVERY - DATABASE INITIALIZATION
-- ==========================================

-- Drop tables if exist (for clean install)
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS order_ratings CASCADE;
DROP TABLE IF EXISTS courier_locations CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS payout_requests CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS couriers CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- ==========================================
-- USERS TABLE (Admin/Manager/Agent)
-- ==========================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'agent' CHECK (role IN ('admin', 'manager', 'agent')),
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  refresh_token TEXT,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- CUSTOMERS TABLE
-- ==========================================
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(100),
  password VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- COURIERS TABLE
-- ==========================================
CREATE TABLE couriers (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  id_number VARCHAR(20) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  whatsapp_id VARCHAR(50) UNIQUE,
  email VARCHAR(100),
  address TEXT,
  age INTEGER,
  gender VARCHAR(10) CHECK (gender IN ('male', 'female')),
  work_area VARCHAR(20) CHECK (work_area IN ('center', 'north', 'south', 'jerusalem')),
  vehicle_type VARCHAR(30) DEFAULT 'motorcycle' CHECK (vehicle_type IN ('motorcycle', 'car', 'van', 'truck')),
  vehicle_plate VARCHAR(20),
  profile_photo_url TEXT,
  status VARCHAR(20) DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'blocked')),
  rating DECIMAL(3,2) DEFAULT 5.00,
  total_deliveries INTEGER DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0,
  balance DECIMAL(10,2) DEFAULT 0,
  is_online BOOLEAN DEFAULT false,
  current_lat DECIMAL(10,8),
  current_lng DECIMAL(11,8),
  last_location_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ORDERS TABLE
-- ==========================================
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(20) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'published', 'taken', 'picked', 'delivered', 'cancelled')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('normal', 'express', 'urgent')),
  
  -- Sender info
  sender_name VARCHAR(100) NOT NULL,
  sender_phone VARCHAR(20) NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_lat DECIMAL(10,8),
  pickup_lng DECIMAL(11,8),
  pickup_notes TEXT,
  
  -- Receiver info
  receiver_name VARCHAR(100) NOT NULL,
  receiver_phone VARCHAR(20) NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_lat DECIMAL(10,8),
  delivery_lng DECIMAL(11,8),
  delivery_notes TEXT,
  
  -- Package info
  package_description TEXT,
  package_weight DECIMAL(10,2),
  package_size VARCHAR(20),
  notes TEXT,
  
  -- Pricing
  vehicle_type VARCHAR(30) NOT NULL,
  distance_km DECIMAL(10,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  vat DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL,
  commission DECIMAL(10,2) NOT NULL,
  courier_payout DECIMAL(10,2) NOT NULL,
  
  -- Relations
  customer_id INTEGER REFERENCES customers(id),
  courier_id INTEGER REFERENCES couriers(id),
  created_by INTEGER REFERENCES users(id),
  
  -- Status timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  taken_at TIMESTAMP,
  picked_at TIMESTAMP,
  delivered_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- PAYOUT REQUESTS TABLE
-- ==========================================
CREATE TABLE payout_requests (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER NOT NULL REFERENCES couriers(id),
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('bank_transfer', 'bit', 'cash')),
  account_info JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  processed_by INTEGER REFERENCES users(id),
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- ==========================================
-- PAYMENTS TABLE
-- ==========================================
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER NOT NULL REFERENCES couriers(id),
  payout_request_id INTEGER REFERENCES payout_requests(id),
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(30) NOT NULL,
  reference_number VARCHAR(100),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ORDER RATINGS TABLE
-- ==========================================
CREATE TABLE order_ratings (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  courier_id INTEGER NOT NULL REFERENCES couriers(id),
  customer_phone VARCHAR(20) NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  speed_rating INTEGER CHECK (speed_rating >= 1 AND speed_rating <= 5),
  courtesy_rating INTEGER CHECK (courtesy_rating >= 1 AND courtesy_rating <= 5),
  professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- COURIER LOCATIONS TABLE (ללא UNIQUE!)
-- ==========================================
CREATE TABLE courier_locations (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER NOT NULL REFERENCES couriers(id),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  accuracy DECIMAL(10,2),
  heading DECIMAL(5,2),
  speed DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ACTIVITY LOG TABLE
-- ==========================================
CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  description TEXT,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- SETTINGS TABLE
-- ==========================================
CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INDEXES
-- ==========================================

-- Users
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_active ON users(active);

-- Customers
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_status ON customers(status);

-- Couriers
CREATE INDEX idx_couriers_phone ON couriers(phone);
CREATE INDEX idx_couriers_id_number ON couriers(id_number);
CREATE INDEX idx_couriers_status ON couriers(status);
CREATE INDEX idx_couriers_vehicle_type ON couriers(vehicle_type);
CREATE INDEX idx_couriers_is_online ON couriers(is_online);
CREATE INDEX idx_couriers_work_area ON couriers(work_area);

-- Orders
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_courier_id ON orders(courier_id);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_created_by ON orders(created_by);

-- Payout Requests
CREATE INDEX idx_payout_requests_courier_id ON payout_requests(courier_id);
CREATE INDEX idx_payout_requests_status ON payout_requests(status);
CREATE INDEX idx_payout_requests_created_at ON payout_requests(created_at DESC);

-- Payments
CREATE INDEX idx_payments_courier_id ON payments(courier_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Order Ratings
CREATE INDEX idx_order_ratings_courier_id ON order_ratings(courier_id);
CREATE INDEX idx_order_ratings_order_id ON order_ratings(order_id);

-- Courier Locations (רק index רגיל, לא UNIQUE!)
CREATE INDEX idx_courier_locations_courier_id ON courier_locations(courier_id);
CREATE INDEX idx_courier_locations_created_at ON courier_locations(created_at DESC);

-- Activity Log
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);

-- ==========================================
-- DEFAULT DATA
-- ==========================================

-- Default Admin User (password: Admin123!)
INSERT INTO users (username, password, name, role) VALUES
('admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIeWU/T8p.', 'מנהל ראשי', 'admin');

-- Default Settings
INSERT INTO settings (key, value) VALUES
('company_name', 'M.M.H Delivery'),
('company_phone', '050-1234567'),
('company_email', 'info@mmh-delivery.com'),
('auto_publish_orders', 'false'),
('require_manager_approval', 'true'),
('min_payout_amount', '50');

-- ==========================================
-- FIX EXISTING CONSTRAINT (if running on existing DB)
-- ==========================================

DO $$
BEGIN
  -- הסר constraint ישן אם קיים
  ALTER TABLE courier_locations DROP CONSTRAINT IF EXISTS courier_locations_courier_id_key;
  RAISE NOTICE '✅ Removed old UNIQUE constraint from courier_locations';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No constraint to remove';
END $$;

-- ==========================================
-- SUCCESS MESSAGE
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '============================================';
  RAISE NOTICE '✅ M.M.H Delivery Database Initialized!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Tables Created:';
  RAISE NOTICE '   - users (Admin/Manager/Agent)';
  RAISE NOTICE '   - customers';
  RAISE NOTICE '   - couriers (with age, gender, work_area)';
  RAISE NOTICE '   - orders';
  RAISE NOTICE '   - payout_requests';
  RAISE NOTICE '   - payments';
  RAISE NOTICE '   - order_ratings';
  RAISE NOTICE '   - courier_locations (FIXED!)';
  RAISE NOTICE '   - activity_log';
  RAISE NOTICE '   - settings';
  RAISE NOTICE '';
  RAISE NOTICE '👤 Default Admin User:';
  RAISE NOTICE '   Username: admin';
  RAISE NOTICE '   Password: Admin123!';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Change the default password immediately!';
  RAISE NOTICE '============================================';
END $$;
