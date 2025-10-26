const express = require('express');
const logger = require('./lib/logger');
const sessionCleaner = require('./lib/session-cleaner');
const { DeploymentChecker } = require('./lib/deployment-check');

async function initializeServer(app) {
  // Add logging middleware
  app.use(logger.expressMiddleware());

  // Initialize session cleanup
  sessionCleaner.start();

  // Run deployment checks in development
  if (process.env.NODE_ENV === 'development') {
    const checker = new DeploymentChecker();
    const checkResult = await checker.runAllChecks();
    if (checkResult.warnings.length > 0) {
      logger.warn('Deployment warnings:', { warnings: checkResult.warnings });
    }
  }

  // Graceful shutdown handler
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    
    // Stop session cleanup
    sessionCleaner.stop();
    
    // Close database connections and other cleanup
    try {
      await require('./lib/database-manager').end();
      logger.info('Cleanup completed, shutting down.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during cleanup:', { error });
      process.exit(1);
    }
  });

  return app;
}

module.exports = initializeServer;