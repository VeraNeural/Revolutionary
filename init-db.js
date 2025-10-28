require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initializeDatabase() {
  try {
    console.log('🔄 Starting database initialization...');

    // Read the schema file
    const schema = fs.readFileSync(path.join(__dirname, 'database-schema.sql'), 'utf8');

    // Execute the schema
    await pool.query(schema);

    console.log('✅ Database initialized successfully!');
    console.log('Checking tables...');

    // Verify tables
    const tables = ['users', 'messages', 'crisis_alerts', 'session', 'subscription_history'];
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`✅ Table ${table}: exists (${result.rows[0].count} rows)`);
      } catch (err) {
        console.error(`❌ Table ${table}: failed to verify - ${err.message}`);
      }
    }
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

initializeDatabase().catch(console.error);
