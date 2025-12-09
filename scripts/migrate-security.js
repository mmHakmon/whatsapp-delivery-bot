/**
 * M.M.H Delivery System - Security Migration Script
 * Run this to add security columns to existing database
 * 
 * Usage: node migrate-security.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting security migration...\n');

    // הוספת עמודות אבטחה לטבלת משתמשים
    console.log('📦 Adding security columns to users table...');
    
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;
    `);
    console.log('  ✅ Added two_factor_enabled column');
    
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS refresh_token TEXT;
    `);
    console.log('  ✅ Added refresh_token column');

    // עדכון סיסמאות קיימות ל-bcrypt rounds גבוה יותר (אופציונלי)
    console.log('\n🔐 Security columns added successfully!');
    
    // הצג סטטוס
    const users = await client.query("SELECT id, username, role, two_factor_enabled FROM users");
    console.log('\n📋 Current users:');
    users.rows.forEach(u => {
      console.log(`  - ${u.username} (${u.role}) - 2FA: ${u.two_factor_enabled ? '✅' : '❌'}`);
    });

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('🎉 Security migration completed successfully!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n💡 Tips:');
    console.log('  - Admin users can enable 2FA from their profile');
    console.log('  - 2FA codes are sent via WhatsApp');
    console.log('  - Make sure users have phone numbers set\n');

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
