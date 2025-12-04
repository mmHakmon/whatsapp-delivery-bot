// init-db.js - Initialize database tables
const { pool } = require('./config/database');

const initDatabase = async () => {
  const client = await pool.connect();
  
  try {
    // Check if tables exist
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'system_settings'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ Database tables already exist');
      return;
    }
    
    console.log('🔧 Creating database tables...');
    
    // Create all tables
    await client.query(`
      -- Enable UUID extension
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- מנהלים של המערכת
      CREATE TABLE IF NOT EXISTS admins (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          phone VARCHAR(20),
          role VARCHAR(50) DEFAULT 'admin',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- שליחים
      CREATE TABLE IF NOT EXISTS couriers (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(100) NOT NULL,
          phone VARCHAR(20) UNIQUE NOT NULL,
          whatsapp_id VARCHAR(50),
          email VARCHAR(255),
          id_number VARCHAR(20),
          vehicle_type VARCHAR(50),
          vehicle_number VARCHAR(20),
          bank_account JSONB,
          base_rate DECIMAL(10,2) DEFAULT 15.00,
          bonus_rate DECIMAL(10,2) DEFAULT 5.00,
          rating DECIMAL(3,2) DEFAULT 5.00,
          total_deliveries INTEGER DEFAULT 0,
          status VARCHAR(20) DEFAULT 'active',
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_active TIMESTAMP,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- משלוחים
      CREATE TABLE IF NOT EXISTS deliveries (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          delivery_number VARCHAR(20) UNIQUE NOT NULL,
          pickup_name VARCHAR(100) NOT NULL,
          pickup_phone VARCHAR(20) NOT NULL,
          pickup_address TEXT NOT NULL,
          pickup_city VARCHAR(100) NOT NULL,
          pickup_notes TEXT,
          pickup_time_from TIMESTAMP,
          pickup_time_to TIMESTAMP,
          dropoff_name VARCHAR(100) NOT NULL,
          dropoff_phone VARCHAR(20) NOT NULL,
          dropoff_address TEXT NOT NULL,
          dropoff_city VARCHAR(100) NOT NULL,
          dropoff_notes TEXT,
          dropoff_time_from TIMESTAMP,
          dropoff_time_to TIMESTAMP,
          package_description TEXT,
          package_size VARCHAR(20) DEFAULT 'medium',
          package_weight DECIMAL(10,2),
          is_fragile BOOLEAN DEFAULT false,
          requires_signature BOOLEAN DEFAULT false,
          cash_on_delivery DECIMAL(10,2) DEFAULT 0,
          base_price DECIMAL(10,2) NOT NULL,
          express_fee DECIMAL(10,2) DEFAULT 0,
          distance_fee DECIMAL(10,2) DEFAULT 0,
          total_price DECIMAL(10,2) NOT NULL,
          courier_payment DECIMAL(10,2),
          status VARCHAR(30) DEFAULT 'pending',
          priority VARCHAR(20) DEFAULT 'normal',
          courier_id UUID REFERENCES couriers(id),
          assigned_at TIMESTAMP,
          created_by UUID REFERENCES admins(id),
          published_at TIMESTAMP,
          picked_up_at TIMESTAMP,
          delivered_at TIMESTAMP,
          cancelled_at TIMESTAMP,
          whatsapp_message_id VARCHAR(100),
          whatsapp_group_id VARCHAR(100),
          estimated_distance DECIMAL(10,2),
          actual_distance DECIMAL(10,2),
          customer_rating INTEGER,
          customer_feedback TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- היסטוריית סטטוסים
      CREATE TABLE IF NOT EXISTS delivery_status_history (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          delivery_id UUID REFERENCES deliveries(id) ON DELETE CASCADE,
          status VARCHAR(30) NOT NULL,
          changed_by_type VARCHAR(20),
          changed_by_id UUID,
          notes TEXT,
          location JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- תשלומים לשליחים
      CREATE TABLE IF NOT EXISTS courier_payments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          courier_id UUID REFERENCES couriers(id),
          period_start DATE NOT NULL,
          period_end DATE NOT NULL,
          total_deliveries INTEGER DEFAULT 0,
          total_distance DECIMAL(10,2) DEFAULT 0,
          base_earnings DECIMAL(10,2) DEFAULT 0,
          bonus_earnings DECIMAL(10,2) DEFAULT 0,
          tips DECIMAL(10,2) DEFAULT 0,
          deductions DECIMAL(10,2) DEFAULT 0,
          total_amount DECIMAL(10,2) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          approved_by UUID REFERENCES admins(id),
          approved_at TIMESTAMP,
          paid_at TIMESTAMP,
          payment_reference VARCHAR(100),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- פירוט משלוחים לתשלום
      CREATE TABLE IF NOT EXISTS payment_delivery_items (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          payment_id UUID REFERENCES courier_payments(id) ON DELETE CASCADE,
          delivery_id UUID REFERENCES deliveries(id),
          amount DECIMAL(10,2) NOT NULL,
          bonus DECIMAL(10,2) DEFAULT 0,
          tip DECIMAL(10,2) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- קבוצות וואטסאפ
      CREATE TABLE IF NOT EXISTS whatsapp_groups (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          group_id VARCHAR(100) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(50) DEFAULT 'couriers',
          is_active BOOLEAN DEFAULT true,
          member_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- לוג הודעות
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          message_id VARCHAR(100) UNIQUE,
          group_id VARCHAR(100),
          sender_phone VARCHAR(20),
          sender_name VARCHAR(100),
          message_type VARCHAR(30),
          content TEXT,
          direction VARCHAR(10),
          delivery_id UUID REFERENCES deliveries(id),
          status VARCHAR(20),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- תגובות לכפתורים
      CREATE TABLE IF NOT EXISTS button_responses (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          message_id VARCHAR(100),
          delivery_id UUID REFERENCES deliveries(id),
          courier_id UUID REFERENCES couriers(id),
          button_id VARCHAR(50),
          response_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          was_first BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- הגדרות מערכת
      CREATE TABLE IF NOT EXISTS system_settings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          key VARCHAR(100) UNIQUE NOT NULL,
          value JSONB NOT NULL,
          description TEXT,
          updated_by UUID REFERENCES admins(id),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- אזורי משלוח ותמחור
      CREATE TABLE IF NOT EXISTS delivery_zones (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(100) NOT NULL,
          cities TEXT[],
          base_price DECIMAL(10,2) NOT NULL,
          price_per_km DECIMAL(10,2) DEFAULT 2.00,
          courier_rate DECIMAL(10,2),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- תבניות הודעות
      CREATE TABLE IF NOT EXISTS message_templates (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL,
          language VARCHAR(10) DEFAULT 'he',
          content TEXT NOT NULL,
          variables TEXT[],
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- סטטיסטיקות יומיות
      CREATE TABLE IF NOT EXISTS daily_stats (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          date DATE UNIQUE NOT NULL,
          total_deliveries INTEGER DEFAULT 0,
          completed_deliveries INTEGER DEFAULT 0,
          cancelled_deliveries INTEGER DEFAULT 0,
          total_revenue DECIMAL(10,2) DEFAULT 0,
          total_courier_payments DECIMAL(10,2) DEFAULT 0,
          average_delivery_time INTEGER,
          average_rating DECIMAL(3,2),
          active_couriers INTEGER DEFAULT 0,
          new_couriers INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
      CREATE INDEX IF NOT EXISTS idx_deliveries_courier ON deliveries(courier_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries(created_at);
      CREATE INDEX IF NOT EXISTS idx_couriers_phone ON couriers(phone);
      CREATE INDEX IF NOT EXISTS idx_couriers_status ON couriers(status);
      CREATE INDEX IF NOT EXISTS idx_payments_courier ON courier_payments(courier_id);
    `);

    // Insert default settings
    await client.query(`
      INSERT INTO system_settings (key, value, description) VALUES
      ('business_hours', '{"start": "08:00", "end": "22:00", "days": [0,1,2,3,4,5]}', 'שעות פעילות העסק'),
      ('default_courier_rate', '{"base": 15, "per_km": 2, "express_bonus": 10}', 'תעריף ברירת מחדל לשליחים'),
      ('auto_cancel_minutes', '"30"', 'דקות עד ביטול אוטומטי'),
      ('whatsapp_config', '{"phone_number_id": "", "business_account_id": "", "access_token": ""}', 'הגדרות WhatsApp API')
      ON CONFLICT (key) DO NOTHING;
    `);

    // Insert default admin (password: admin123)
    await client.query(`
      INSERT INTO admins (name, email, password_hash, role) VALUES
      ('Admin', 'admin@delivery.com', '$2a$10$8K1p/jKz3q2x5y9z0vwXe.YQZ1234567890abcdefghijklmnop', 'super_admin')
      ON CONFLICT (email) DO NOTHING;
    `);

    console.log('✅ Database tables created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating database tables:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = initDatabase;
