/**
 * M.M.H Delivery System - Database Initialization Script
 * Run this once to set up the database tables
 * 
 * Usage: node scripts/init-db.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database initialization...\n');

    // Create tables
    console.log('📦 Creating tables...');
    
    await client.query(`
      -- Users table (מנהלים ונציגים)
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'agent',
        phone VARCHAR(20),
        email VARCHAR(100),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );

      -- Couriers table (שליחים)
      CREATE TABLE IF NOT EXISTS couriers (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        id_number VARCHAR(20) UNIQUE NOT NULL,
        phone VARCHAR(20) NOT NULL,
        whatsapp_id VARCHAR(50),
        email VARCHAR(100),
        address VARCHAR(255),
        vehicle_type VARCHAR(30) DEFAULT 'motorcycle',
        status VARCHAR(20) DEFAULT 'active',
        rating DECIMAL(3,2) DEFAULT 5.00,
        total_deliveries INT DEFAULT 0,
        total_earned DECIMAL(10,2) DEFAULT 0,
        balance DECIMAL(10,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Customers table (לקוחות קבועים)
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(100),
        address VARCHAR(255),
        business_name VARCHAR(100),
        discount_percent DECIMAL(5,2) DEFAULT 0,
        credit_limit DECIMAL(10,2) DEFAULT 0,
        balance DECIMAL(10,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Orders table (הזמנות)
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number VARCHAR(20) UNIQUE NOT NULL,
        customer_id INT REFERENCES customers(id),
        sender_name VARCHAR(100) NOT NULL,
        sender_phone VARCHAR(20) NOT NULL,
        pickup_address VARCHAR(255) NOT NULL,
        pickup_lat DECIMAL(10,8),
        pickup_lng DECIMAL(11,8),
        receiver_name VARCHAR(100) NOT NULL,
        receiver_phone VARCHAR(20) NOT NULL,
        delivery_address VARCHAR(255) NOT NULL,
        delivery_lat DECIMAL(10,8),
        delivery_lng DECIMAL(11,8),
        details TEXT,
        category VARCHAR(30) DEFAULT 'regular',
        priority VARCHAR(20) DEFAULT 'normal',
        price DECIMAL(10,2) NOT NULL,
        commission_rate DECIMAL(5,2) DEFAULT 25.00,
        commission DECIMAL(10,2),
        courier_payout DECIMAL(10,2),
        payment_method VARCHAR(20) DEFAULT 'cash',
        payment_status VARCHAR(20) DEFAULT 'pending',
        status VARCHAR(20) DEFAULT 'new',
        courier_id INT REFERENCES couriers(id),
        created_by INT REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        published_at TIMESTAMP,
        taken_at TIMESTAMP,
        picked_at TIMESTAMP,
        delivered_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancel_reason TEXT,
        delivery_proof_url VARCHAR(255),
        signature_url VARCHAR(255),
        notes TEXT
      );

      -- Payments table (תשלומים לשליחים)
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        courier_id INT REFERENCES couriers(id),
        amount DECIMAL(10,2) NOT NULL,
        type VARCHAR(20) DEFAULT 'payout',
        method VARCHAR(20),
        reference VARCHAR(100),
        notes TEXT,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Activity log (לוג פעילות)
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(30),
        entity_id INT,
        details JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Settings table
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('✅ Tables created successfully!\n');

    // Create indexes
    console.log('📇 Creating indexes...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
      CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
      CREATE INDEX IF NOT EXISTS idx_couriers_phone ON couriers(phone);
      CREATE INDEX IF NOT EXISTS idx_couriers_id_number ON couriers(id_number);
      CREATE INDEX IF NOT EXISTS idx_couriers_whatsapp ON couriers(whatsapp_id);
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
    `);
    
    console.log('✅ Indexes created successfully!\n');

    // Create default admin user
    console.log('👤 Creating default admin user...');
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await client.query(`
      INSERT INTO users (username, password, name, role, phone)
      VALUES ('admin', $1, 'מנהל ראשי', 'admin', '0500000000')
      ON CONFLICT (username) DO NOTHING
    `, [hashedPassword]);
    
    console.log('✅ Admin user created (username: admin, password: admin123)\n');

    // Insert default settings
    console.log('⚙️ Setting up default configuration...');
    
    await client.query(`
      INSERT INTO settings (key, value) VALUES
        ('commission_rate', '25'),
        ('company_name', 'M.M.H משלוחים'),
        ('company_phone', ''),
        ('whatsapp_group_id', ''),
        ('order_counter', '100')
      ON CONFLICT (key) DO NOTHING
    `);
    
    console.log('✅ Default settings configured!\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Database initialization completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n📋 Default login credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('\n⚠️  Please change the admin password after first login!\n');

  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase();
