const { Pool } = require('pg');

const dbConfig = {
    connectionString: process.env.DATABASE_PUBLIC_URL,
    ssl: { rejectUnauthorized: false }
};

async function checkDatabase() {
    const pool = new Pool(dbConfig);
    
    try {
        // List all tables
        console.log('📊 Checking database tables...\n');
        const tables = await pool.query(`
            SELECT 
                table_name,
                (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count,
                pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size,
                (SELECT count(*) FROM information_schema.key_column_usage WHERE table_name = t.table_name) as key_count
            FROM information_schema.tables t
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        if (tables.rows.length === 0) {
            console.log('❌ No tables found in the database!\n');
        } else {
            console.log('Found tables:');
            tables.rows.forEach(table => {
                console.log(`➡️ ${table.table_name}`);
                console.log(`   Columns: ${table.column_count}`);
                console.log(`   Size: ${table.size}`);
                console.log(`   Keys: ${table.key_count}\n`);
            });
        }

        // Check for specific required tables
        const requiredTables = [
            'users',
            'conversations',
            'messages',
            'session',
            'crisis_alerts',
            'leads'
        ];

        console.log('🔍 Checking required tables:');
        requiredTables.forEach(tableName => {
            const found = tables.rows.some(t => t.table_name === tableName);
            console.log(`${found ? '✅' : '❌'} ${tableName}`);
        });

    } catch (error) {
        console.error('❌ Database check failed:', error.message);
    } finally {
        await pool.end();
    }
}

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Run the check
checkDatabase();