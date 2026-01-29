const { Client } = require('pg');

async function cleanupDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('🔗 Connected to database');

    // Drop all views first
    console.log('🗑️  Dropping views...');
    await client.query('DROP VIEW IF EXISTS curresponse_orders CASCADE;');
    console.log('✅ Views dropped');

    // Drop all old tables with CASCADE
    console.log('🗑️  Dropping old tables...');
    const tables = [
      'courier_locations',
      'couriers',
      'customers',
      'deliveries',
      'payout_requests',
      'push_subscriptions',
      'settings',
      'users',
      '_prisma_migrations'
    ];

    for (const table of tables) {
      try {
        await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
        console.log(`   ✓ Dropped: ${table}`);
      } catch (err) {
        console.log(`   ⚠ Could not drop ${table}: ${err.message}`);
      }
    }

    console.log('✅ Database cleanup completed');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

cleanupDatabase();
