const winston = require('winston');
const { format } = winston;
const path = require('path');

// Custom log format
const customFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.metadata(),
  format.json()
);

// Define log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  trace: 5,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
  trace: 'gray',
};

winston.addColors(colors);

class Logger {
  constructor() {
    const logsDir = path.join(process.cwd(), 'logs');

    this.logger = winston.createLogger({
      levels,
      format: customFormat,
      transports: [
        // Error logs
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
        // Combined logs
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
        // Console output for development
        new winston.transports.Console({
          format: format.combine(format.colorize(), format.simple()),
        }),
      ],
    });

    // Add request tracking
    this.requestsInProgress = new Map();
  }

  // Log method wrappers
  error(message, meta = {}) {
    this.logger.error(message, { metadata: meta });
  }

  warn(message, meta = {}) {
    this.logger.warn(message, { metadata: meta });
  }

  info(message, meta = {}) {
    this.logger.info(message, { metadata: meta });
  }

  http(message, meta = {}) {
    this.logger.http(message, { metadata: meta });
  }

  debug(message, meta = {}) {
    this.logger.debug(message, { metadata: meta });
  }

  trace(message, meta = {}) {
    this.logger.log('trace', message, { metadata: meta });
  }

  // Request tracking
  startRequest(requestId, details) {
    this.requestsInProgress.set(requestId, {
      startTime: Date.now(),
      ...details,
    });
  }

  endRequest(requestId) {
    const request = this.requestsInProgress.get(requestId);
    if (request) {
      const duration = Date.now() - request.startTime;
      this.info('Request completed', {
        requestId,
        duration,
        ...request,
      });
      this.requestsInProgress.delete(requestId);
    }
  }

  // Express middleware
  expressMiddleware() {
    return (req, res, next) => {
      const requestId = req.id || Math.random().toString(36).substring(7);
      req.id = requestId;

      this.startRequest(requestId, {
        method: req.method,
        url: req.url,
        userAgent: req.get('user-agent'),
        ip: req.ip,
      });

      res.on('finish', () => {
        this.endRequest(requestId);
      });

      next();
    };
  }
}

// Create and export singleton instance
const logger = new Logger();
module.exports = logger;
