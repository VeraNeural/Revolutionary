require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const dbConfig = {
  connectionString: process.env.DATABASE_PUBLIC_URL,
  ssl: { rejectUnauthorized: false },
};

async function diagnoseDatabase() {
  const pool = new Pool(dbConfig);

  try {
    console.log('🔍 Starting Database Diagnosis\n');

    // 1. Check Connection
    console.log('1️⃣ Testing Database Connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');

    // 2. Check Existing Tables
    console.log('2️⃣ Checking Existing Tables...');
    const tables = await pool.query(`
            SELECT 
                table_name,
                (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count,
                pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
            FROM information_schema.tables t
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

    console.log('Found Tables:');
    tables.rows.forEach((t) => {
      console.log(`➡️ ${t.table_name} (${t.column_count} columns, size: ${t.size})`);
    });
    console.log('');

    // 3. Check Table Constraints
    console.log('3️⃣ Checking Table Constraints...');
    const constraints = await pool.query(`
            SELECT 
                tc.table_name, 
                tc.constraint_name, 
                tc.constraint_type
            FROM information_schema.table_constraints tc
            WHERE tc.table_schema = 'public'
            ORDER BY tc.table_name;
        `);

    console.log('Found Constraints:');
    constraints.rows.forEach((c) => {
      console.log(`➡️ ${c.table_name}: ${c.constraint_name} (${c.constraint_type})`);
    });
    console.log('');

    // 4. Check Recent Errors
    console.log('4️⃣ Checking Recent Database Errors...');
    const errors = await pool.query(`
            SELECT 
                NOW() - query_start as time_ago,
                state,
                query,
                wait_event_type
            FROM pg_stat_activity 
            WHERE state = 'active' 
            AND query NOT ILIKE '%pg_stat_activity%'
            ORDER BY query_start DESC 
            LIMIT 5;
        `);

    if (errors.rows.length > 0) {
      console.log('Recent Queries:');
      errors.rows.forEach((e) => {
        console.log(`➡️ State: ${e.state} (${e.time_ago} ago)`);
        console.log(`   Wait: ${e.wait_event_type || 'none'}`);
        console.log(`   Query: ${e.query.substring(0, 100)}...`);
      });
    } else {
      console.log('No active queries found');
    }
  } catch (error) {
    console.error('❌ Diagnosis Error:', error.message);
  } finally {
    await pool.end();
  }
}

diagnoseDatabase();
