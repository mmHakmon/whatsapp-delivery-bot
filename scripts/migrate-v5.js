/**
 * M.M.H Delivery System - Migration v5.0
 * הוספת טבלאות חדשות: activity_log, zones, blacklist, order_notes, message_templates, courier_ratings
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  console.log('🚀 Starting Migration v5.0...\n');
  
  try {
    // 1. Activity Log - לוג פעילות
    console.log('📝 Creating activity_log table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(50) NOT NULL,
        description TEXT,
        details JSONB DEFAULT '{}',
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC)`);
    console.log('   ✅ activity_log created\n');

    // 2. Zones - אזורים ומחירונים
    console.log('🗺️ Creating zones table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zones (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        base_price DECIMAL(10,2) DEFAULT 50,
        price_per_km DECIMAL(10,2) DEFAULT 5,
        areas JSONB DEFAULT '[]',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ zones created\n');

    // 3. Blacklist - רשימה שחורה
    console.log('🚫 Creating blacklist table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id SERIAL PRIMARY KEY,
        type VARCHAR(20) NOT NULL CHECK (type IN ('phone', 'name', 'address', 'courier')),
        value VARCHAR(255) NOT NULL,
        reason TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blacklist_type ON blacklist(type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blacklist_value ON blacklist(value)`);
    console.log('   ✅ blacklist created\n');

    // 4. Order Notes - הערות להזמנות
    console.log('📌 Creating order_notes table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_notes (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        note TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_notes_order ON order_notes(order_id)`);
    console.log('   ✅ order_notes created\n');

    // 5. Message Templates - תבניות הודעות
    console.log('💬 Creating message_templates table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'general',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ message_templates created\n');

    // 6. Courier Ratings - דירוגי שליחים
    console.log('⭐ Creating courier_ratings table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courier_ratings (
        id SERIAL PRIMARY KEY,
        courier_id INTEGER REFERENCES couriers(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES orders(id),
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_courier_ratings_courier ON courier_ratings(courier_id)`);
    console.log('   ✅ courier_ratings created\n');

    // 7. הוספת עמודות חדשות לטבלאות קיימות
    console.log('🔧 Adding new columns to existing tables...');
    
    // rating לשליחים
    try {
      await pool.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 0`);
      console.log('   ✅ couriers.rating added');
    } catch (e) { console.log('   ⚠️ couriers.rating already exists'); }

    // notes לשליחים (אם לא קיים)
    try {
      await pool.query(`ALTER TABLE couriers ADD COLUMN IF NOT EXISTS notes TEXT`);
      console.log('   ✅ couriers.notes added');
    } catch (e) { console.log('   ⚠️ couriers.notes already exists'); }

    // customer_notified להזמנות
    try {
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notified BOOLEAN DEFAULT false`);
      console.log('   ✅ orders.customer_notified added');
    } catch (e) { console.log('   ⚠️ orders.customer_notified already exists'); }

    // 8. הוספת תבניות הודעות ברירת מחדל
    console.log('\n📋 Adding default message templates...');
    const templates = [
      { name: 'הודעת לקוח - נתפס', content: '🏍️ שלום {customer_name}!\n\nהמשלוח שלך ({order_number}) נתפס על ידי שליח ובקרוב ייאסף.\n\nתודה שבחרתם ב-M.M.H Delivery!', type: 'customer' },
      { name: 'הודעת לקוח - נאסף', content: '📦 המשלוח {order_number} נאסף ובדרך ליעד!', type: 'customer' },
      { name: 'הודעת לקוח - נמסר', content: '✅ המשלוח {order_number} נמסר בהצלחה!\n\nתודה שבחרתם ב-M.M.H Delivery! 🙏', type: 'customer' },
      { name: 'תזכורת שליח', content: '⏰ תזכורת: יש לך משלוח פעיל ({order_number}) שטרם נאסף.\n\nאנא עדכן סטטוס.', type: 'courier' }
    ];
    
    for (const t of templates) {
      try {
        await pool.query(
          `INSERT INTO message_templates (name, content, type) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM message_templates WHERE name = $1)`,
          [t.name, t.content, t.type]
        );
      } catch (e) { }
    }
    console.log('   ✅ Default templates added\n');

    // 9. הוספת אזורים לדוגמה
    console.log('🗺️ Adding sample zones...');
    const zones = [
      { name: 'תל אביב', basePrice: 40, areas: ['תל אביב', 'רמת גן', 'גבעתיים', 'בני ברק'] },
      { name: 'מרכז', basePrice: 50, areas: ['פתח תקווה', 'ראשון לציון', 'חולון', 'בת ים'] },
      { name: 'שרון', basePrice: 60, areas: ['נתניה', 'הרצליה', 'רעננה', 'כפר סבא'] },
      { name: 'ירושלים', basePrice: 70, areas: ['ירושלים', 'בית שמש', 'מודיעין'] },
      { name: 'צפון', basePrice: 80, areas: ['חיפה', 'עכו', 'נהריה', 'קריות'] },
      { name: 'דרום', basePrice: 80, areas: ['באר שבע', 'אשדוד', 'אשקלון'] }
    ];
    
    for (const z of zones) {
      try {
        await pool.query(
          `INSERT INTO zones (name, base_price, areas) SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM zones WHERE name = $1)`,
          [z.name, z.basePrice, JSON.stringify(z.areas)]
        );
      } catch (e) { }
    }
    console.log('   ✅ Sample zones added\n');

    console.log('═══════════════════════════════════════════');
    console.log('✅ Migration v5.0 completed successfully!');
    console.log('═══════════════════════════════════════════\n');
    
    console.log('New features added:');
    console.log('  📝 Activity Log - לוג פעילות');
    console.log('  🗺️ Zones - אזורים ומחירונים');
    console.log('  🚫 Blacklist - רשימה שחורה');
    console.log('  📌 Order Notes - הערות להזמנות');
    console.log('  💬 Message Templates - תבניות הודעות');
    console.log('  ⭐ Courier Ratings - דירוגי שליחים');
    console.log('  🏍️ Courier App - דף שליח');
    console.log('  📊 Reports & Export - דוחות וייצוא');
    console.log('  🔍 Advanced Search - חיפוש מתקדם');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
