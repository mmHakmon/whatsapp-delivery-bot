/**
 * M.M.H Delivery System - Courier Fields Migration
 * הוספת עמודות email ו-vehicle_type לטבלת השליחים
 * 
 * Usage: node migrate-courier-fields.js
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
    console.log('🔄 Starting courier fields migration...\n');

    // הוספת עמודת email
    console.log('📧 Adding email column...');
    await client.query(`
      ALTER TABLE couriers 
      ADD COLUMN IF NOT EXISTS email VARCHAR(100)
    `);
    console.log('  ✅ email column added');

    // הוספת עמודת vehicle_type
    console.log('🚗 Adding vehicle_type column...');
    await client.query(`
      ALTER TABLE couriers 
      ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(30) DEFAULT 'motorcycle'
    `);
    console.log('  ✅ vehicle_type column added');

    // הצג סטטוס
    const couriers = await client.query(`
      SELECT id, first_name, last_name, phone, email, vehicle_type 
      FROM couriers ORDER BY id
    `);
    
    console.log('\n📋 Current couriers:');
    if (couriers.rows.length === 0) {
      console.log('  No couriers found');
    } else {
      couriers.rows.forEach(c => {
        const vehicle = c.vehicle_type === 'motorcycle' ? '🏍️' : 
                       c.vehicle_type === 'car' ? '🚗' : 
                       c.vehicle_type === 'commercial' ? '🚚' : '🏍️';
        console.log(`  ${vehicle} ${c.first_name} ${c.last_name} - ${c.phone} ${c.email ? `(${c.email})` : ''}`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎉 Migration completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n📝 New Features Available:');
    console.log('  • Courier Registration: /courier/register');
    console.log('  • Auto-Identify on Take Order');
    console.log('  • Quick Take for Registered Couriers');
    console.log('\n💡 Share this link with couriers for registration:');
    console.log('  https://mmh-delivery.onrender.com/courier/register\n');

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
