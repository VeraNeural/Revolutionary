require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const dbConfig = {
    connectionString: process.env.DATABASE_PUBLIC_URL,
    ssl: { rejectUnauthorized: false }
};

const pool = new Pool(dbConfig);

async function initializeDatabase() {
    try {
        console.log('🔄 Starting database initialization...');

        // Create users table
        await pool.query(`
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
                reset_token_expires TIMESTAMP,
                phone VARCHAR(50)
            )
        `);
        console.log('✅ Users table initialized');

        // Create conversations table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                title VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                message_count INTEGER DEFAULT 0,
                last_message_preview TEXT
            )
        `);
        console.log('✅ Conversations table initialized');

        // Create messages table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                conversation_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Messages table initialized');

        // Create session table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS session (
                sid VARCHAR NOT NULL COLLATE "default",
                sess JSON NOT NULL,
                expire TIMESTAMP(6) NOT NULL,
                PRIMARY KEY (sid)
            )
        `);
        console.log('✅ Session table initialized');

        // Create crisis_alerts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS crisis_alerts (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                message_content TEXT NOT NULL,
                detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Crisis alerts table initialized');

        // Create leads table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                company VARCHAR(255),
                phone VARCHAR(50),
                use_case VARCHAR(100),
                lead_source VARCHAR(255),
                referrer TEXT,
                utm_source VARCHAR(255),
                utm_medium VARCHAR(255),
                utm_campaign VARCHAR(255),
                user_agent TEXT,
                timezone VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                converted_at TIMESTAMP,
                status VARCHAR(50) DEFAULT 'new'
            )
        `);
        console.log('✅ Leads table initialized');

        // Now let's check what tables exist
        const tables = await pool.query(`
            SELECT table_name, 
                   (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        console.log('\n📊 Current database tables:');
        tables.rows.forEach(table => {
            console.log(`➡️ ${table.table_name} (${table.column_count} columns)`);
        });

        console.log('\n✅ Database initialization complete!');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    } finally {
        await pool.end();
    }
}

initializeDatabase();