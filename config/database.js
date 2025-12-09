/**
 * M.M.H Delivery System Pro v4.0
 * Database Module
 * 
 * PostgreSQL connection with:
 * - Connection pooling
 * - Health checks
 * - Graceful shutdown
 * - Query logging (in development)
 */

const { Pool } = require('pg');
const { DB_CONFIG, CONFIG } = require('../config');

// Create pool with configuration
const pool = new Pool(DB_CONFIG);

// Connection event handlers
pool.on('connect', (client) => {
  if (CONFIG.NODE_ENV === 'development') {
    console.log('📊 New database client connected');
  }
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected database error:', err.message);
});

// Health check function
const healthCheck = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW() as time, version() as version');
    return {
      status: 'healthy',
      timestamp: result.rows[0].time,
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingConnections: pool.waitingCount,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
    };
  } finally {
    client.release();
  }
};

// Query wrapper with logging (development only)
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (CONFIG.NODE_ENV === 'development' && duration > 100) {
      console.log('🐢 Slow query:', { text: text.substring(0, 100), duration: `${duration}ms` });
    }
    
    return result;
  } catch (error) {
    console.error('❌ Database query error:', {
      query: text.substring(0, 100),
      error: error.message,
    });
    throw error;
  }
};

// Get client for transactions
const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  
  // Override release to handle transaction cleanup
  let released = false;
  client.release = () => {
    if (released) {
      console.warn('⚠️ Client already released');
      return;
    }
    released = true;
    return originalRelease();
  };
  
  return client;
};

// Transaction helper
const transaction = async (callback) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('📊 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
};

// Handle process termination
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  healthCheck,
  shutdown,
};
