/**
 * M.M.H Delivery System - Phase 1 & 2 Migration
 * הוספת טבלאות ועמודות חדשות לתמיכה בדאשבורדים, התראות ודירוגים
 * 
 * Usage: node migrate-phase1-2.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Phase 1 & 2 Migration...\n');

    // ============ PHASE 1 TABLES ============
    
    // 1. Push Notifications Table - שמירת מנויים להתראות
    console.log('📱 Creating push_subscriptions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'courier', 'agent')),
        user_id INTEGER,
        phone VARCHAR(20),
        subscription_data JSONB NOT NULL,
        device_info JSONB,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_type, user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_push_phone ON push_subscriptions(phone)`);
    console.log('   ✅ push_subscriptions created\n');

    // 2. Notifications Log - לוג של כל ההתראות שנשלחו
    console.log('🔔 Creating notifications_log table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications_log (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('customer', 'courier', 'agent')),
        recipient_id INTEGER,
        recipient_phone VARCHAR(20),
        notification_type VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        message TEXT NOT NULL,
        channel VARCHAR(20) DEFAULT 'push' CHECK (channel IN ('push', 'sms', 'whatsapp', 'email')),
        status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'read')),
        metadata JSONB,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_order ON notifications_log(order_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications_log(recipient_type, recipient_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notif_type ON notifications_log(notification_type)`);
    console.log('   ✅ notifications_log created\n');

    // 3. Order Ratings - דירוגים למשלוחים
    console.log('⭐ Creating order_ratings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_ratings (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        courier_id INTEGER REFERENCES couriers(id),
        customer_phone VARCHAR(20),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        speed_rating INTEGER CHECK (speed_rating >= 1 AND speed_rating <= 5),
        courtesy_rating INTEGER CHECK (courtesy_rating >= 1 AND courtesy_rating <= 5),
        professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(order_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rating_courier ON order_ratings(courier_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rating_order ON order_ratings(order_id)`);
    console.log('   ✅ order_ratings created\n');

    // 4. Courier Locations - מיקומים בזמן אמת של שליחים
    console.log('📍 Creating courier_locations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS courier_locations (
        id SERIAL PRIMARY KEY,
        courier_id INTEGER REFERENCES couriers(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        latitude DECIMAL(10,8) NOT NULL,
        longitude DECIMAL(11,8) NOT NULL,
        accuracy DECIMAL(10,2),
        heading DECIMAL(5,2),
        speed DECIMAL(5,2),
        battery_level INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(courier_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_location_courier ON courier_locations(courier_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_location_order ON courier_locations(order_id)`);
    console.log('   ✅ courier_locations created\n');

    // 5. Customer Accounts - חשבונות לקוחות רשומים
    console.log('👤 Creating customer_accounts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_accounts (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100),
        email VARCHAR(100),
        password_hash VARCHAR(255),
        push_token TEXT,
        favorite_addresses JSONB DEFAULT '[]',
        notification_preferences JSONB DEFAULT '{"push": true, "sms": false, "whatsapp": true, "email": false}',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_phone ON customer_accounts(phone)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_email ON customer_accounts(email)`);
    console.log('   ✅ customer_accounts created\n');

    // ============ PHASE 2 TABLES ============

    // 6. Delivery Proofs - אישורי מסירה (תמונות וחתימות)
    console.log('📸 Creating delivery_proofs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_proofs (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        courier_id INTEGER REFERENCES couriers(id),
        proof_type VARCHAR(20) CHECK (proof_type IN ('photo', 'signature', 'code')),
        photo_url TEXT,
        signature_data TEXT,
        verification_code VARCHAR(10),
        receiver_name VARCHAR(100),
        receiver_id VARCHAR(20),
        location_lat DECIMAL(10,8),
        location_lng DECIMAL(11,8),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_proof_order ON delivery_proofs(order_id)`);
    console.log('   ✅ delivery_proofs created\n');

    // 7. Payment Transactions - טרנזקציות תשלום מפורטות
    console.log('💳 Creating payment_transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        customer_id INTEGER,
        courier_id INTEGER REFERENCES couriers(id),
        transaction_type VARCHAR(30) CHECK (transaction_type IN ('customer_payment', 'courier_payout', 'refund', 'bonus')),
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'ILS',
        payment_method VARCHAR(30),
        payment_provider VARCHAR(50),
        transaction_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trans_order ON payment_transactions(order_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trans_courier ON payment_transactions(courier_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trans_status ON payment_transactions(status)`);
    console.log('   ✅ payment_transactions created\n');

    // 8. Courier Earnings - סיכום רווחים של שליחים
    console.log('💰 Creating courier_earnings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS courier_earnings (
        id SERIAL PRIMARY KEY,
        courier_id INTEGER REFERENCES couriers(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        total_deliveries INTEGER DEFAULT 0,
        total_earned DECIMAL(10,2) DEFAULT 0,
        total_paid DECIMAL(10,2) DEFAULT 0,
        balance DECIMAL(10,2) DEFAULT 0,
        bonuses DECIMAL(10,2) DEFAULT 0,
        penalties DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(courier_id, date)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_earnings_courier ON courier_earnings(courier_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_earnings_date ON courier_earnings(date)`);
    console.log('   ✅ courier_earnings created\n');

    // 9. WhatsApp Bot Messages - לוג הודעות בוט
    console.log('💬 Creating whatsapp_bot_messages table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_bot_messages (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        courier_id INTEGER REFERENCES couriers(id) ON DELETE SET NULL,
        message_type VARCHAR(30) CHECK (message_type IN ('order_published', 'order_taken', 'pickup_reminder', 'delivery_reminder', 'customer_notification')),
        recipient_phone VARCHAR(20),
        message_content TEXT,
        whatsapp_message_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_wa_order ON whatsapp_bot_messages(order_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_wa_courier ON whatsapp_bot_messages(courier_id)`);
    console.log('   ✅ whatsapp_bot_messages created\n');

    // 10. Analytics Daily Stats - סטטיסטיקות יומיות
    console.log('📊 Creating analytics_daily table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_daily (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        total_orders INTEGER DEFAULT 0,
        completed_orders INTEGER DEFAULT 0,
        cancelled_orders INTEGER DEFAULT 0,
        total_revenue DECIMAL(10,2) DEFAULT 0,
        total_commissions DECIMAL(10,2) DEFAULT 0,
        active_couriers INTEGER DEFAULT 0,
        avg_delivery_time INTEGER,
        avg_rating DECIMAL(3,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_daily(date)`);
    console.log('   ✅ analytics_daily created\n');

    // ============ MODIFY EXISTING TABLES ============
    
    console.log('🔧 Adding new columns to existing tables...');
    
    // Add tracking fields to orders
    try {
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_pickup_time TIMESTAMP`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_time TIMESTAMP`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_distance DECIMAL(10,2)`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_duration INTEGER`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS verification_code VARCHAR(6)`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5)`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMP`);
      console.log('   ✅ orders table enhanced');
    } catch (e) { console.log('   ⚠️ orders columns already exist'); }

    // Add profile fields to couriers
    try {
      await client.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
      await client.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(20)`);
      await client.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false`);
      await client.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMP`);
      await client.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10,8)`);
      await client.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS current_lng DECIMAL(11,8)`);
      await client.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"order_published": true, "order_near": true, "reminders": true}'`);
      console.log('   ✅ couriers table enhanced');
    } catch (e) { console.log('   ⚠️ couriers columns already exist'); }

    // Add customer tracking to orders
    try {
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notified_taken BOOLEAN DEFAULT false`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notified_picked BOOLEAN DEFAULT false`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notified_nearby BOOLEAN DEFAULT false`);
      await client.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notified_delivered BOOLEAN DEFAULT false`);
      console.log('   ✅ customer notification tracking added');
    } catch (e) { console.log('   ⚠️ notification columns already exist'); }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎉 Phase 1 & 2 Migration completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n📋 New Tables Created:');
    console.log('  Phase 1:');
    console.log('    📱 push_subscriptions - Push notification subscriptions');
    console.log('    🔔 notifications_log - Notification history');
    console.log('    ⭐ order_ratings - Customer ratings');
    console.log('    📍 courier_locations - Real-time tracking');
    console.log('    👤 customer_accounts - Customer dashboard accounts');
    console.log('  Phase 2:');
    console.log('    📸 delivery_proofs - Delivery proof of delivery');
    console.log('    💳 payment_transactions - Payment tracking');
    console.log('    💰 courier_earnings - Courier earnings summary');
    console.log('    💬 whatsapp_bot_messages - WhatsApp bot log');
    console.log('    📊 analytics_daily - Daily statistics');
    console.log('\n💡 Next Steps:');
    console.log('  1. Update .env with Push notification credentials');
    console.log('  2. Deploy courier dashboard at /courier/dashboard');
    console.log('  3. Deploy customer dashboard at /customer/dashboard');
    console.log('  4. Configure WhatsApp bot webhooks');
    console.log('  5. Test push notifications\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
