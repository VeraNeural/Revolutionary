// Initialize VERA database tables
require('dotenv').config({ path: '.env.local' });
const db = require('./lib/database-manager');

async function initDatabase() {
  try {
    console.log('🔄 Connecting to database...');

    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        subscription_status VARCHAR(50) DEFAULT 'inactive',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        trial_ends_at TIMESTAMP,
        onboarding_completed BOOLEAN DEFAULT false,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP
      )
    `);
    console.log('✅ Users table created');

    // Create messages table
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Messages table created');

    // Create crisis_alerts table
    await db.query(`
      CREATE TABLE IF NOT EXISTS crisis_alerts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        message_content TEXT NOT NULL,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Crisis alerts table created');

    // Create session table
    await db.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        PRIMARY KEY (sid)
      )
    `);
    console.log('✅ Session table created');

    console.log('');
    console.log('🎉 Database initialized successfully!');
    console.log('VERA is ready to remember everything.');

    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();
