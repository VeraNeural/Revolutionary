const { version } = require('../package.json');

class SystemMonitor {
    constructor(pool, options = {}) {
        this.pool = pool;
        this.startTime = Date.now();
        this.checkInterval = options.checkInterval || 300000; // 5 minutes
        this.metrics = {
            uptime: 0,
            responseTime: [],
            errors: [],
            lastAICall: null,
            dbConnected: false,
            activeConnections: 0
        };
    }

    async checkHealth() {
        const health = {
            status: 'healthy',
            version: version,
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            timestamp: new Date().toISOString(),
            components: {}
        };

        // Check Database
        try {
            const dbStart = Date.now();
            const result = await this.pool.query('SELECT NOW()');
            health.components.database = {
                status: 'connected',
                responseTime: Date.now() - dbStart,
                connections: await this.getActiveConnections()
            };
        } catch (error) {
            health.components.database = {
                status: 'error',
                error: error.message
            };
            health.status = 'degraded';
        }

        // Check memory usage
        const memUsage = process.memoryUsage();
        health.components.memory = {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
            rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
        };

        // Check recent errors
        health.components.errors = {
            last24h: this.metrics.errors.filter(e => 
                (Date.now() - e.timestamp) < 24 * 60 * 60 * 1000
            ).length
        };

        // API Response times
        const recentResponses = this.metrics.responseTime
            .filter(r => (Date.now() - r.timestamp) < 5 * 60 * 1000);
        if (recentResponses.length > 0) {
            health.components.api = {
                avgResponseTime: Math.round(
                    recentResponses.reduce((sum, r) => sum + r.duration, 0) / recentResponses.length
                ) + 'ms',
                requests5m: recentResponses.length
            };
        }

        // AI Service status
        health.components.ai = {
            lastCall: this.metrics.lastAICall,
            status: Date.now() - (this.metrics.lastAICall?.timestamp || 0) < 5 * 60 * 1000 
                ? 'active' 
                : 'idle'
        };

        return health;
    }

    async getActiveConnections() {
        try {
            const result = await this.pool.query(
                "SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()"
            );
            return parseInt(result.rows[0].count);
        } catch (error) {
            console.error('Error getting connection count:', error);
            return -1;
        }
    }

    recordError(error) {
        this.metrics.errors.push({
            timestamp: Date.now(),
            message: error.message,
            stack: error.stack
        });

        // Keep only last 100 errors
        if (this.metrics.errors.length > 100) {
            this.metrics.errors = this.metrics.errors.slice(-100);
        }
    }

    recordResponse(duration) {
        this.metrics.responseTime.push({
            timestamp: Date.now(),
            duration
        });

        // Keep only last 1000 responses
        if (this.metrics.responseTime.length > 1000) {
            this.metrics.responseTime = this.metrics.responseTime.slice(-1000);
        }
    }

    recordAICall(info) {
        this.metrics.lastAICall = {
            timestamp: Date.now(),
            ...info
        };
    }
}

module.exports = SystemMonitor;