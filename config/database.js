module.exports = {
    // Railway PostgreSQL configuration
    production: {
        max: 20,                     // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,    // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000,// Return an error after 2 seconds if connection could not be established
        statement_timeout: 10000,     // 10s query timeout
        query_timeout: 10000,        // 10s query timeout
        application_name: 'vera-revolutionary', // Helps identify the application in pg_stat_activity
    },
    
    // Local development configuration
    development: {
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        application_name: 'vera-dev',
    },
    
    // Test configuration
    test: {
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 1000,
        application_name: 'vera-test',
    }
};