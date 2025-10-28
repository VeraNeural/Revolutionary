require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

async function testDatabaseConnection() {
  console.log('\n🔍 Testing database connection...');

  const connectionString =
    process.env.DATABASE_PUBLIC_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:ZdHTjuvhoPOhBUpvbBOUnslFSDKKcwhu@ballast.proxy.rlwy.net:37630/railway';

  console.log(`Using connection URL: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);

  // Create a NEW pool for each test
  const pool = new Pool({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 5, // Limit connections for testing
    connectionTimeoutMillis: 5000,
  });

  try {
    // Test 1: Basic connection
    console.log('\n📡 Test 1: Basic Connection');
    const result = await pool.query('SELECT NOW() as current_time, version() as postgres_version');
    console.log('✅ Database connection successful!');
    console.log(`   Server time: ${result.rows[0].current_time}`);
    console.log(`   PostgreSQL: ${result.rows[0].postgres_version.split(',')[0]}`);

    // Test 2: Check if tables exist
    console.log('\n📊 Test 2: Checking Tables');
    const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

    if (tablesResult.rows.length > 0) {
      console.log('✅ Found tables:');
      tablesResult.rows.forEach((row) => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('⚠️  No tables found (database might be empty)');
    }

    // Test 3: Test read/write capability
    console.log('\n✍️  Test 3: Read/Write Test');
    await pool.query(`
            CREATE TABLE IF NOT EXISTS connection_test (
                id SERIAL PRIMARY KEY,
                test_time TIMESTAMP DEFAULT NOW(),
                message TEXT
            );
        `);

    await pool.query(`
            INSERT INTO connection_test (message) 
            VALUES ('Test connection successful');
        `);

    const testResult = await pool.query(`
            SELECT * FROM connection_test 
            ORDER BY test_time DESC 
            LIMIT 1;
        `);

    console.log('✅ Read/Write test successful!');
    console.log(`   Last test: ${testResult.rows[0].test_time}`);

    // Cleanup
    await pool.query('DROP TABLE connection_test;');

    console.log('\n🎉 All database tests passed!');
    console.log('✅ Your Railway database is working perfectly.\n');

    return true;
  } catch (error) {
    console.error('\n❌ Database test failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code}`);

    if (error.code === 'ENOTFOUND') {
      console.error('\n💡 DNS lookup failed - check your internet connection');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('\n💡 Connection refused - Railway service might be down');
    } else if (error.code === '28P01') {
      console.error('\n💡 Authentication failed - check your DATABASE_URL credentials');
    }

    return false;
  } finally {
    // Properly close the pool
    await pool.end();
    console.log('🔌 Connection pool closed.\n');
  }
}

// Run the test
testDatabaseConnection()
  .then((success) => {
    if (success) {
      console.log('✅ DATABASE IS READY FOR VERA SERVER\n');
      process.exit(0);
    } else {
      console.log('❌ Fix database issues before starting server\n');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
