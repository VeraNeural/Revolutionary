require('dotenv').config({ path: '.env.local' });
const db = require('./lib/database-manager');

async function checkDatabase() {
    console.log('🔍 Checking VERA database tables...');
    
    try {
        // Get all tables
        const result = await db.query(`
            SELECT 
                table_name,
                (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count,
                (SELECT count(*) FROM ONLY pg_catalog.pg_class c WHERE c.relname = t.table_name) as row_estimate
            FROM information_schema.tables t
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        console.log('\n📋 Found Tables:');
        result.rows.forEach(table => {
            console.log(`\n🔹 ${table.table_name}`);
            console.log(`   Columns: ${table.column_count}`);
            console.log(`   Estimated Rows: ${table.row_estimate}`);
        });

        // Check for specific required tables
        const requiredTables = [
            'users',
            'messages',
            'conversations',
            'session',
            'crisis_alerts',
            'leads'
        ];

        console.log('\n✅ Required Tables Check:');
        const missingTables = requiredTables.filter(
            table => !result.rows.find(t => t.table_name === table)
        );

        if (missingTables.length > 0) {
            console.log('❌ Missing Tables:');
            missingTables.forEach(table => console.log(`   - ${table}`));
        } else {
            console.log('✅ All required tables are present!');
        }

    } catch (error) {
        console.error('❌ Database check failed:', error.message);
    } finally {
        await db.end();
    }
}

checkDatabase();