require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createPushSubscriptionsTable() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Creating push_subscriptions table...');

    // Create table
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'courier')),
        user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        keys JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Table push_subscriptions created');

    // Create index on user_type and user_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user 
      ON push_subscriptions(user_type, user_id);
    `);

    console.log('✅ Index idx_push_subscriptions_user created');

    // Create index on endpoint
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint 
      ON push_subscriptions(endpoint);
    `);

    console.log('✅ Index idx_push_subscriptions_endpoint created');

    // Verify table exists
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'push_subscriptions';
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verification: Table exists in database');
      
      // Show table structure
      const columns = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'push_subscriptions'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📋 Table structure:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type}`);
      });
    }

    console.log('\n🎉 Push notifications table setup complete!');
    
  } catch (error) {
    console.error('❌ Error creating push_subscriptions table:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
createPushSubscriptionsTable()
  .then(() => {
    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
