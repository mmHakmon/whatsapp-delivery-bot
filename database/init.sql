-- ==========================================
-- M.M.H DELIVERY DATABASE SCHEMA
-- ==========================================

-- Drop existing tables
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS courier_locations CASCADE;
DROP TABLE IF EXISTS order_ratings CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS payout_requests CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS couriers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS settings CASCADE;

-- ==========================================
-- USERS TABLE (Admins/Managers)
-- ==========================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'agent' CHECK (role IN ('admin', 'manager', 'agent')),
  phone VARCHAR(20),
  email VARCHAR(100),
  active BOOLEAN DEFAULT true,
  two_factor_enabled BOOLEAN DEFAULT false,
  refresh_token TEXT,
  last_login TIMESTAMP,
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
  vehicle_type VARCHAR(30) DEFAULT 'motorcycle' CHECK (vehicle_type IN ('motorcycle', 'car', 'van', 'truck')),
  vehicle_plate VARCHAR(20),
  profile_photo_url TEXT,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
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
  
  -- Sender
  sender_name VARCHAR(100) NOT NULL,
  sender_phone VARCHAR(20) NOT NULL,
  pickup_address TEXT NOT NULL,
  pickup_lat DECIMAL(10,8),
  pickup_lng DECIMAL(11,8),
  pickup_notes TEXT,
  
  -- Receiver
  receiver_name VARCHAR(100) NOT NULL,
  receiver_phone VARCHAR(20) NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_lat DECIMAL(10,8),
  delivery_lng DECIMAL(11,8),
  delivery_notes TEXT,
  
  -- Package
  package_description TEXT,
  package_photo_url TEXT,
  notes TEXT,
  
  -- Pricing
  vehicle_type VARCHAR(30),
  distance_km DECIMAL(5,2),
  price DECIMAL(10,2) NOT NULL,
  vat DECIMAL(10,2),
  commission_rate DECIMAL(5,2) DEFAULT 25.00,
  commission DECIMAL(10,2),
  courier_payout DECIMAL(10,2),
  
  -- Relations
  courier_id INTEGER REFERENCES couriers(id),
  created_by INTEGER REFERENCES users(id),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  taken_at TIMESTAMP,
  picked_at TIMESTAMP,
  delivered_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT
);

-- ==========================================
-- PAYOUT REQUESTS TABLE
-- ==========================================
CREATE TABLE payout_requests (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER REFERENCES couriers(id) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  account_info TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  admin_notes TEXT,
  processed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- ==========================================
-- PAYMENTS TABLE
-- ==========================================
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER REFERENCES couriers(id) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(50) NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ORDER RATINGS TABLE
-- ==========================================
CREATE TABLE order_ratings (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) UNIQUE NOT NULL,
  courier_id INTEGER REFERENCES couriers(id) NOT NULL,
  customer_phone VARCHAR(20),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  speed_rating INTEGER CHECK (speed_rating >= 1 AND speed_rating <= 5),
  courtesy_rating INTEGER CHECK (courtesy_rating >= 1 AND courtesy_rating <= 5),
  professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- COURIER LOCATIONS TABLE
-- ==========================================
CREATE TABLE courier_locations (
  courier_id INTEGER PRIMARY KEY REFERENCES couriers(id),
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  accuracy DECIMAL(6,2),
  heading DECIMAL(5,2),
  speed DECIMAL(5,2),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ACTIVITY LOG TABLE
-- ==========================================
CREATE TABLE activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  description TEXT,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- SETTINGS TABLE
-- ==========================================
CREATE TABLE settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_courier ON orders(courier_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_couriers_phone ON couriers(phone);
CREATE INDEX idx_couriers_status ON couriers(status);
CREATE INDEX idx_payout_status ON payout_requests(status);
CREATE INDEX idx_payout_courier ON payout_requests(courier_id);

-- ==========================================
-- DEFAULT ADMIN USER
-- password: Admin123!
-- ==========================================
INSERT INTO users (username, password, name, role) VALUES
('admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5lk3vM3fZHqDi', 'Admin User', 'admin');

-- ==========================================
-- DEMO DATA (OPTIONAL)
-- ==========================================

-- Demo Couriers
INSERT INTO couriers (first_name, last_name, id_number, phone, vehicle_type, status) VALUES
('יוסי', 'כהן', '123456789', '0501234567', 'motorcycle', 'active'),
('דני', 'לוי', '987654321', '0507654321', 'car', 'active'),
('משה', 'אברהם', '456789123', '0509876543', 'van', 'active');

-- Demo Settings
INSERT INTO settings (key, value, description) VALUES
('company_name', 'M.M.H Delivery', 'Company name'),
('support_phone', '0501234567', 'Support phone number'),
('min_payout_amount', '50', 'Minimum payout amount in ILS'),
('commission_rate', '25', 'Default commission rate percentage');