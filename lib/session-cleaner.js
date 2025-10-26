const cron = require('node-cron');
const db = require('./database-manager');
const logger = require('./logger');

class SessionCleaner {
  constructor() {
    // Run cleanup every day at 3 AM
    this.schedule = '0 3 * * *';
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('Session cleanup task already running');
      return;
    }

    logger.info('Starting session cleanup scheduler');
    
    cron.schedule(this.schedule, async () => {
      try {
        await this.cleanup();
      } catch (error) {
        logger.error('Session cleanup failed:', { error });
      }
    });

    this.isRunning = true;
  }

  async cleanup() {
    logger.info('Starting session cleanup');
    
    try {
      // Delete expired sessions (older than 30 days)
      const result = await db.query(
        'DELETE FROM "session" WHERE expire < NOW() - INTERVAL \'30 days\' RETURNING *'
      );

      logger.info('Session cleanup completed', {
        deletedCount: result.rowCount
      });

      // Vacuum the session table to reclaim space
      await db.query('VACUUM "session"');
      
      // Optional: Delete abandoned anonymous sessions
      await this.cleanupAnonSessions();

      return {
        success: true,
        cleanedCount: result.rowCount
      };
    } catch (error) {
      logger.error('Session cleanup error:', { error });
      throw error;
    }
  }

  async cleanupAnonSessions() {
    try {
      // Delete anonymous sessions inactive for more than 7 days
      const result = await db.query(`
        DELETE FROM "session"
        WHERE sid LIKE 'anon_%'
        AND expire < NOW() - INTERVAL '7 days'
        RETURNING *
      `);

      logger.info('Anon session cleanup completed', {
        deletedCount: result.rowCount
      });

      return result.rowCount;
    } catch (error) {
      logger.error('Anon session cleanup error:', { error });
      throw error;
    }
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping session cleanup scheduler');
    this.isRunning = false;
  }
}

// Create and export singleton instance
const sessionCleaner = new SessionCleaner();
module.exports = sessionCleaner;