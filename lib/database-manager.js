const { Pool } = require('pg');

class DatabaseManager {
    constructor() {
        const dbConfig = {
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000, // Increased from 2000
            // Railway-specific optimizations
            statement_timeout: 10000,
            query_timeout: 10000,
        };

        // Determine which connection URL to use
        let connectionUrl;
        
        // In Railway environment, prefer internal URL
        if (process.env.RAILWAY_ENVIRONMENT) {
            connectionUrl = process.env.DATABASE_URL;
            console.log('🚂 Using Railway internal connection');
        } 
        // In development or other environments, use public URL
        else {
            connectionUrl = process.env.DATABASE_PUBLIC_URL;
            console.log('🌐 Using public database connection');
        }

        if (!connectionUrl) {
            console.error('❌ No database URL configured!');
            console.error('Make sure either DATABASE_URL or DATABASE_PUBLIC_URL is set');
            throw new Error('Database configuration missing');
        }

        // Configure SSL based on environment
        if (process.env.RAILWAY_ENVIRONMENT) {
            dbConfig.ssl = false; // Internal Railway connections don't need SSL
        } else {
            dbConfig.ssl = { rejectUnauthorized: false }; // Public connections need SSL
        }

        dbConfig.connectionString = connectionUrl;

        // Initialize the pool
        this.pool = new Pool(dbConfig);
        
        // Connection error handler
        this.pool.on('error', (err, client) => {
            console.error('🔴 Unexpected database error:', err.message);
            if (err.code === 'ECONNRESET' || err.code === '57P01') {
                console.log('↻ Connection terminated, will auto-reconnect');
            }
            if (process.env.RAILWAY_ENVIRONMENT) {
                console.error('🚂 Railway deployment affected');
            }
        });

        // Set up health monitoring
        this.setupHealthMonitoring();
    }

    setupHealthMonitoring() {
        let consecutiveFailures = 0;
        
        setInterval(async () => {
            try {
                await this.pool.query('SELECT 1');
                if (consecutiveFailures > 0) {
                    console.log('✅ Database connection restored');
                    consecutiveFailures = 0;
                }
            } catch (error) {
                consecutiveFailures++;
                console.error(`❌ Database health check failed (attempt ${consecutiveFailures}):`, error.message);
                
                // If we've had multiple failures, try to recover
                if (consecutiveFailures >= 3) {
                    console.log('🔄 Attempting connection pool reset...');
                    try {
                        await this.resetPool();
                        console.log('✅ Connection pool reset successfully');
                    } catch (resetError) {
                        console.error('❌ Failed to reset connection pool:', resetError.message);
                    }
                }
            }
        }, 30000); // Check every 30 seconds
    }

    async resetPool() {
        try {
            await this.pool.end();
            this.pool = new Pool(this.pool.options);
        } catch (error) {
            console.error('❌ Error resetting pool:', error.message);
            throw error;
        }
    }

    async query(text, params) {
        const start = Date.now();
        let retries = 3;
        
        while (retries > 0) {
            try {
                const res = await this.pool.query(text, params);
                const duration = Date.now() - start;
                
                // Log slow queries in production
                if (duration > 1000 && process.env.RAILWAY_ENVIRONMENT) {
                    console.warn('� Slow Query:', {
                        text: text.substring(0, 100) + '...',
                        duration,
                        rows: res.rowCount,
                    });
                }
                
                return res;
            } catch (err) {
                retries--;
                
                // Don't retry certain errors
                if (err.code === '42P01' || // undefined_table
                    err.code === '42703' || // undefined_column
                    err.code === '23505') { // unique_violation
                    throw err;
                }
                
                // Log the error
                console.error(`❌ Query Error (${retries} retries left):`, {
                    code: err.code,
                    message: err.message,
                    query: text.substring(0, 100) + '...'
                });

                if (retries === 0) {
                    throw err;
                }
                
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, 3-retries) * 100));
            }
        }
    }

    async checkDatabaseHealth() {
        try {
            const result = await this.pool.query(`
                SELECT 
                    NOW() as now,
                    version() as version,
                    current_database() as current_database,
                    current_user as current_user,
                    pg_database_size(current_database()) as db_size
            `);

            const stats = await this.pool.query(`
                SELECT schemaname, relname, n_live_tup
                FROM pg_stat_user_tables
                ORDER BY n_live_tup DESC
                LIMIT 5
            `);

            const { now, version, current_database, current_user, db_size } = result.rows[0];

            const health = {
                status: 'healthy',
                timestamp: now,
                database: current_database,
                user: current_user,
                version: version.split(' ')[0],
                size: Math.round(db_size / 1024 / 1024) + ' MB',
                tables: stats.rows.map(row => ({
                    schema: row.schemaname,
                    name: row.relname,
                    rows: row.n_live_tup
                })),
                environment: process.env.RAILWAY_ENVIRONMENT ? 'railway' : 'development',
                connectionType: process.env.RAILWAY_ENVIRONMENT ? 'internal' : 'public'
            };

            return health;
        } catch (err) {
            return {
                status: 'unhealthy',
                error: err.message,
                code: err.code,
                timestamp: new Date(),
                environment: process.env.RAILWAY_ENVIRONMENT ? 'railway' : 'development'
            };
        }
    }

    async getPoolStatus() {
        return {
            totalConnections: this.pool.totalCount,
            idleConnections: this.pool.idleCount,
            waitingClients: this.pool.waitingCount,
            maxConnections: this.pool.options.max
        };
    }

    async end() {
        await this.pool.end();
    }
}

// Create and export a single instance
const dbManager = new DatabaseManager();

// Handle process termination
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, closing database connections...');
    await dbManager.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, closing database connections...');
    await dbManager.end();
    process.exit(0);
});

module.exports = dbManager;