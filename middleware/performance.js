const { performance } = require('perf_hooks');
const logger = require('../lib/logger');
const monitor = require('../lib/monitoring');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requestTimes: new Map(),
      dbQueryTimes: new Map(),
      apiCallTimes: new Map(),
      memoryUsage: [],
    };

    // Sample memory usage every minute
    setInterval(() => this.sampleMemoryUsage(), 60000);
  }

  middleware() {
    return (req, res, next) => {
      const start = performance.now();
      const requestId = req.id;

      // Track request timing
      this.metrics.requestTimes.set(requestId, start);

      // Track response time
      res.on('finish', () => {
        const duration = performance.now() - start;
        this.recordMetric('requestDuration', duration, {
          path: req.path,
          method: req.method,
          status: res.statusCode,
        });
      });

      next();
    };
  }

  // Database query timing
  async trackDbQuery(query, params, callback) {
    const start = performance.now();
    try {
      const result = await callback();
      const duration = performance.now() - start;

      this.recordMetric('dbQueryDuration', duration, {
        query: this.sanitizeQuery(query),
        paramCount: params?.length,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric('dbQueryError', duration, {
        query: this.sanitizeQuery(query),
        error: error.message,
      });
      throw error;
    }
  }

  // API call timing
  async trackApiCall(name, callback) {
    const start = performance.now();
    try {
      const result = await callback();
      const duration = performance.now() - start;

      this.recordMetric('apiCallDuration', duration, {
        name,
      });

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric('apiCallError', duration, {
        name,
        error: error.message,
      });
      throw error;
    }
  }

  recordMetric(name, value, meta = {}) {
    monitor.recordMetric(name, value);

    // Log slow operations
    if (name === 'requestDuration' && value > 1000) {
      logger.warn('Slow request detected', {
        duration: value,
        ...meta,
      });
    }

    if (name === 'dbQueryDuration' && value > 100) {
      logger.warn('Slow query detected', {
        duration: value,
        ...meta,
      });
    }
  }

  sampleMemoryUsage() {
    const usage = process.memoryUsage();
    this.metrics.memoryUsage.push({
      timestamp: new Date(),
      ...usage,
    });

    // Keep last hour of samples
    const hourAgo = Date.now() - 60 * 60 * 1000;
    this.metrics.memoryUsage = this.metrics.memoryUsage.filter(
      (sample) => sample.timestamp.getTime() > hourAgo
    );

    // Alert on high memory usage
    const heapUsed = usage.heapUsed / 1024 / 1024;
    if (heapUsed > 512) {
      // Alert if over 512MB
      monitor.alertError('High memory usage', {
        heapUsed: `${Math.round(heapUsed)}MB`,
        ...usage,
      });
    }
  }

  sanitizeQuery(query) {
    // Remove actual values from query for logging
    return query.replace(/\$\d+/g, '$X');
  }

  getMetrics() {
    return {
      ...this.metrics,
      currentMemoryUsage: process.memoryUsage(),
    };
  }
}

module.exports = new PerformanceMonitor();
