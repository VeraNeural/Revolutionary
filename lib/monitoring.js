const logger = require('./logger');

class Monitoring {
  constructor() {
    this.metrics = {
      errors: [],
      responseTime: [],
      apiCalls: []
    };
    this.startTime = Date.now();
  }

  // Record metrics
  recordMetric(name, value, meta = {}) {
    const metric = {
      name,
      value,
      timestamp: Date.now(),
      ...meta
    };

    if (name === 'requestDuration') {
      this.metrics.responseTime.push(metric);
      this.trimMetrics('responseTime', 1000);
    } else if (name.includes('Error')) {
      this.metrics.errors.push(metric);
      this.trimMetrics('errors', 100);
    }

    // Log slow operations
    if (name === 'requestDuration' && value > 1000) {
      logger.warn('Slow request detected', { duration: value, ...meta });
    }
  }

  // Alert on errors
  async alertError(title, error) {
    const errorData = {
      title,
      message: error.message || error,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };

    // Log the error
    logger.error(`Alert: ${title}`, errorData);

    // TODO: Add external alerting here (email, Slack, etc.)
    // For now, just log it
    
    this.metrics.errors.push(errorData);
    this.trimMetrics('errors', 100);
  }

  // Get current metrics
  getMetrics() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const recentErrors = this.metrics.errors.filter(e => 
      (Date.now() - e.timestamp) < 24 * 60 * 60 * 1000
    );

    return {
      uptime,
      errorsLast24h: recentErrors.length,
      avgResponseTime: this.getAvgResponseTime(),
      totalRequests: this.metrics.responseTime.length
    };
  }

  // Calculate average response time
  getAvgResponseTime() {
    const recent = this.metrics.responseTime
      .filter(m => (Date.now() - m.timestamp) < 5 * 60 * 1000);
    
    if (recent.length === 0) return 0;
    
    const sum = recent.reduce((acc, m) => acc + m.value, 0);
    return Math.round(sum / recent.length);
  }

  // Trim old metrics to prevent memory leaks
  trimMetrics(type, maxSize) {
    if (this.metrics[type] && this.metrics[type].length > maxSize) {
      this.metrics[type] = this.metrics[type].slice(-maxSize);
    }
  }
}

module.exports = new Monitoring();