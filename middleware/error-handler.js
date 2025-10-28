const logger = require('../lib/logger');
const monitor = require('../lib/monitoring');

class ErrorHandler {
  constructor() {
    this.setup();
  }

  setup() {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleFatalError('Uncaught Exception', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (error) => {
      this.handleFatalError('Unhandled Rejection', error);
    });
  }

  middleware() {
    return async (error, req, res, next) => {
      const errorId = require('crypto').randomBytes(4).toString('hex');

      logger.error('Request error', {
        errorId,
        path: req.path,
        method: req.method,
        error: error.stack,
        body: this.sanitizeRequestBody(req.body),
      });

      // Alert if needed
      if (this.shouldAlert(error)) {
        await monitor.alertError('API Error', {
          errorId,
          message: error.message,
          stack: error.stack,
          path: req.path,
        });
      }

      // Send safe response to client
      res.status(error.status || 500).json({
        error: this.getSafeErrorMessage(error),
        errorId,
        success: false,
      });
    };
  }

  handleFatalError(type, error) {
    logger.error(`Fatal Error: ${type}`, {
      error: error.stack,
      type,
    });

    monitor.alertError(`Fatal Error: ${type}`, error).finally(() => {
      // Wait briefly for alert to send before exiting
      setTimeout(() => process.exit(1), 1000);
    });
  }

  shouldAlert(error) {
    // Alert on all 500s and specific error types
    return error.status === 500 || error.name === 'DatabaseError' || error.code === 'ECONNREFUSED';
  }

  getSafeErrorMessage(error) {
    // Don't expose internal errors to client
    if (error.status === 500) {
      return 'An internal error occurred';
    }
    return error.message;
  }

  sanitizeRequestBody(body) {
    if (!body) return null;

    // Deep clone and sanitize sensitive fields
    const sanitized = JSON.parse(JSON.stringify(body));
    const sensitiveFields = ['password', 'token', 'key'];

    const sanitizeObj = (obj) => {
      for (const key of Object.keys(obj)) {
        if (sensitiveFields.includes(key.toLowerCase())) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object') {
          sanitizeObj(obj[key]);
        }
      }
    };

    sanitizeObj(sanitized);
    return sanitized;
  }
}

module.exports = new ErrorHandler();
