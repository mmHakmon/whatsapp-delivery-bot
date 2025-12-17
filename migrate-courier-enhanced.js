/**
 * M.M.H Delivery System - Courier Enhanced Features Migration
 * הוספת תמיכה ב-GPS tracking ו-online status
 * 
 * Usage: node migrate-courier-enhanced.js
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
    console.log('🔄 Starting courier enhanced features migration...\n');

    // הוספת עמודות GPS
    console.log('📍 Adding GPS tracking columns...');
    await client.query(`
      ALTER TABLE couriers 
      ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10,8),
      ADD COLUMN IF NOT EXISTS current_lng DECIMAL(11,8),
      ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP
    `);
    console.log('  ✅ GPS columns added');

    // הוספת עמודות Online Status
    console.log('🟢 Adding online status columns...');
    await client.query(`
      ALTER TABLE couriers 
      ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP
    `);
    console.log('  ✅ Online status columns added');

    // הוספת אינדקסים לביצועים
    console.log('🔍 Adding indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_couriers_online ON couriers(is_online) WHERE is_online = true;
      CREATE INDEX IF NOT EXISTS idx_couriers_location ON couriers(current_lat, current_lng) WHERE current_lat IS NOT NULL;
    `);
    console.log('  ✅ Indexes created');

    // הצג סטטוס שליחים
    const couriers = await client.query(`
      SELECT 
        id, 
        first_name, 
        last_name, 
        phone,
        email,
        vehicle_type,
        is_online,
        current_lat,
        current_lng
      FROM couriers 
      ORDER BY id
    `);
    
    console.log('\n📋 Current couriers status:');
    if (couriers.rows.length === 0) {
      console.log('  No couriers found');
    } else {
      couriers.rows.forEach(c => {
        const vehicle = c.vehicle_type === 'motorcycle' ? '🏍️' : 
                       c.vehicle_type === 'car' ? '🚗' : 
                       c.vehicle_type === 'commercial' ? '🚚' : '🏍️';
        const online = c.is_online ? '🟢 Online' : '⚪ Offline';
        const location = (c.current_lat && c.current_lng) ? 
                        `📍 (${c.current_lat.toFixed(4)}, ${c.current_lng.toFixed(4)})` : 
                        '📍 (No location)';
        
        console.log(`  ${vehicle} ${c.first_name} ${c.last_name}`);
        console.log(`     ${c.phone} ${c.email ? `• ${c.email}` : ''}`);
        console.log(`     ${online} ${location}`);
        console.log('');
      });
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Migration completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n✨ New Features Enabled:');
    console.log('  • Real-time GPS tracking');
    console.log('  • Online/Offline status');
    console.log('  • Location-based order assignment');
    console.log('  • Distance calculations');
    console.log('\n📝 Next Steps:');
    console.log('  1. Add the new API endpoints to server.js (see api-endpoints-to-add.js)');
    console.log('  2. Update courier-dashboard.html (already done in courier-dashboard-fixed.html)');
    console.log('  3. Test GPS tracking with mobile devices');
    console.log('  4. Configure push notifications for nearby orders\n');

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
