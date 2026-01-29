const { Client } = require('pg');

async function cleanupDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Drop all views
    console.log('Dropping views...');
    await client.query('DROP VIEW IF EXISTS curresponse_orders CASCADE;');
    
    // Drop all tables with CASCADE
    console.log('Dropping tables...');
    const tables = [
      'courier_locations',
      'couriers', 
      'customers',
      'payout_requests',
      'push_subscriptions',
      'settings',
      'users',
      'deliveries'
    ];

    for (const table of tables) {
      await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
      console.log(`Dropped table: ${table}`);
    }

    console.log('✅ Database cleaned successfully');
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
  } finally {
    await client.end();
  }
}

cleanupDatabase();
