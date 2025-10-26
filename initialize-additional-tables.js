require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const dbConfig = {
    connectionString: process.env.DATABASE_PUBLIC_URL,
    ssl: { rejectUnauthorized: false }
};

const pool = new Pool(dbConfig);

async function initializeAdditionalTables() {
    try {
        console.log('🔄 Starting additional tables initialization...');

        // Somatic Tracking Tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS nervous_system_states (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                state_type VARCHAR(50) NOT NULL,
                intensity INTEGER CHECK (intensity >= 0 AND intensity <= 10),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                triggers TEXT[],
                body_sensations TEXT[],
                emotions TEXT[]
            )
        `);
        console.log('✅ Nervous system states table initialized');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS somatic_patterns (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                pattern_name VARCHAR(255) NOT NULL,
                description TEXT,
                first_noticed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                frequency VARCHAR(50),
                intensity_range INTEGER[],
                associated_triggers TEXT[],
                coping_strategies TEXT[]
            )
        `);
        console.log('✅ Somatic patterns table initialized');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS breakthrough_moments (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                title VARCHAR(255),
                description TEXT,
                occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                impact_score INTEGER CHECK (impact_score >= 0 AND impact_score <= 10),
                related_patterns INTEGER[],
                insights TEXT[],
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Breakthrough moments table initialized');

        // Tracking Evolution Tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS outdated_threat_patterns (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                pattern_name VARCHAR(255),
                first_identified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                resolution_date TIMESTAMP,
                original_intensity INTEGER CHECK (intensity >= 0 AND intensity <= 10),
                current_intensity INTEGER CHECK (intensity >= 0 AND intensity <= 10),
                recovery_strategies TEXT[],
                notes TEXT
            )
        `);
        console.log('✅ Outdated threat patterns table initialized');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS regulation_capacity (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                date_assessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                baseline_state VARCHAR(50),
                recovery_time_minutes INTEGER,
                trigger_tolerance INTEGER CHECK (trigger_tolerance >= 0 AND trigger_tolerance <= 10),
                resilience_score INTEGER CHECK (resilience_score >= 0 AND resilience_score <= 100),
                notes TEXT
            )
        `);
        console.log('✅ Regulation capacity table initialized');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS ascension_markers (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                marker_type VARCHAR(50),
                description TEXT,
                achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                significance_level INTEGER CHECK (significance_level >= 0 AND significance_level <= 10),
                associated_practices TEXT[],
                impact_areas TEXT[]
            )
        `);
        console.log('✅ Ascension markers table initialized');

        // Additional Tracking Tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS regulation_evidence (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                evidence_type VARCHAR(50),
                description TEXT,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                intensity_before INTEGER CHECK (intensity_before >= 0 AND intensity_before <= 10),
                intensity_after INTEGER CHECK (intensity_after >= 0 AND intensity_after <= 10),
                techniques_used TEXT[],
                effectiveness_rating INTEGER CHECK (effectiveness_rating >= 0 AND effectiveness_rating <= 10)
            )
        `);
        console.log('✅ Regulation evidence table initialized');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pattern_detections (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                pattern_type VARCHAR(50),
                confidence_score DECIMAL CHECK (confidence_score >= 0 AND confidence_score <= 1),
                detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                supporting_evidence TEXT[]
            )
        `);
        console.log('✅ Pattern detections table initialized');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS consciousness_states (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                state_name VARCHAR(100),
                state_description TEXT,
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                duration_minutes INTEGER,
                triggers TEXT[]
            )
        `);
        console.log('✅ Consciousness states table initialized');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS adaptive_code_detections (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                code_type VARCHAR(50),
                confidence_score DECIMAL CHECK (confidence_score >= 0 AND confidence_score <= 1),
                detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                evidence TEXT[]
            )
        `);
        console.log('✅ Adaptive code detections table initialized');

        // Now let's verify all tables
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

        console.log('\n✅ Additional tables initialization complete!');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        console.error('Error details:', error.message);
    } finally {
        await pool.end();
    }
}

initializeAdditionalTables();