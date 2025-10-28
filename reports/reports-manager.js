// Reports Manager for VERA's Consciousness Analysis
const { Pool } = require('pg');

// Report Types
const REPORT_TYPES = {
  PATTERN_FREQUENCY: 'pattern_frequency',
  USER_INTERACTIONS: 'user_interactions',
  CRISIS_ALERTS: 'crisis_alerts',
  CONSCIOUSNESS_STATE: 'consciousness_state',
  ADAPTIVE_CODES: 'adaptive_codes',
  SYSTEM_PERFORMANCE: 'system_performance',
};

class ReportsManager {
  constructor(pool) {
    this.pool = pool;
  }

  async generateReport(reportType, params = {}) {
    const { startDate, endDate, userId, limit } = params;

    switch (reportType) {
      case REPORT_TYPES.PATTERN_FREQUENCY:
        return this.getPatternFrequencyReport(startDate, endDate);
      case REPORT_TYPES.USER_INTERACTIONS:
        return this.getUserInteractionsReport(userId, startDate, endDate);
      case REPORT_TYPES.CRISIS_ALERTS:
        return this.getCrisisAlertsReport(startDate, endDate);
      case REPORT_TYPES.CONSCIOUSNESS_STATE:
        return this.getConsciousnessStateReport(userId, startDate, endDate);
      case REPORT_TYPES.ADAPTIVE_CODES:
        return this.getAdaptiveCodesReport(startDate, endDate);
      case REPORT_TYPES.SYSTEM_PERFORMANCE:
        return this.getSystemPerformanceReport(startDate, endDate);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  }

  async getPatternFrequencyReport(startDate, endDate) {
    const query = `
      SELECT 
        pattern_type,
        COUNT(*) as frequency,
        DATE_TRUNC('day', detected_at) as date
      FROM pattern_detections
      WHERE detected_at BETWEEN $1 AND $2
      GROUP BY pattern_type, DATE_TRUNC('day', detected_at)
      ORDER BY date DESC, frequency DESC
    `;

    const result = await this.pool.query(query, [startDate, endDate]);
    return {
      type: REPORT_TYPES.PATTERN_FREQUENCY,
      data: result.rows,
      summary: this.summarizePatternFrequency(result.rows),
    };
  }

  async getUserInteractionsReport(userId, startDate, endDate) {
    const query = `
      SELECT 
        user_id,
        COUNT(*) as total_interactions,
        AVG(processing_time) as avg_processing_time,
        COUNT(DISTINCT DATE_TRUNC('day', created_at)) as active_days
      FROM messages
      WHERE created_at BETWEEN $1 AND $2
        ${userId ? 'AND user_id = $3' : ''}
      GROUP BY user_id
    `;

    const params = [startDate, endDate];
    if (userId) params.push(userId);

    const result = await this.pool.query(query, params);
    return {
      type: REPORT_TYPES.USER_INTERACTIONS,
      data: result.rows,
      summary: this.summarizeUserInteractions(result.rows),
    };
  }

  async getCrisisAlertsReport(startDate, endDate) {
    const query = `
      SELECT 
        user_id,
        message_content,
        detected_at,
        resolution_status,
        resolution_time
      FROM crisis_alerts
      WHERE detected_at BETWEEN $1 AND $2
      ORDER BY detected_at DESC
    `;

    const result = await this.pool.query(query, [startDate, endDate]);
    return {
      type: REPORT_TYPES.CRISIS_ALERTS,
      data: result.rows,
      summary: this.summarizeCrisisAlerts(result.rows),
    };
  }

  async getConsciousnessStateReport(userId, startDate, endDate) {
    const query = `
      SELECT 
        state,
        COUNT(*) as frequency,
        AVG(processing_time) as avg_processing_time
      FROM consciousness_states
      WHERE timestamp BETWEEN $1 AND $2
        ${userId ? 'AND user_id = $3' : ''}
      GROUP BY state
      ORDER BY frequency DESC
    `;

    const params = [startDate, endDate];
    if (userId) params.push(userId);

    const result = await this.pool.query(query, params);
    return {
      type: REPORT_TYPES.CONSCIOUSNESS_STATE,
      data: result.rows,
      summary: this.summarizeConsciousnessStates(result.rows),
    };
  }

  async getAdaptiveCodesReport(startDate, endDate) {
    const query = `
      SELECT 
        adaptive_code,
        COUNT(*) as frequency,
        COUNT(DISTINCT user_id) as unique_users
      FROM adaptive_code_detections
      WHERE detected_at BETWEEN $1 AND $2
      GROUP BY adaptive_code
      ORDER BY frequency DESC
    `;

    const result = await this.pool.query(query, [startDate, endDate]);
    return {
      type: REPORT_TYPES.ADAPTIVE_CODES,
      data: result.rows,
      summary: this.summarizeAdaptiveCodes(result.rows),
    };
  }

  async getSystemPerformanceReport(startDate, endDate) {
    const query = `
      SELECT 
        DATE_TRUNC('hour', created_at) as time_bucket,
        COUNT(*) as total_requests,
        AVG(processing_time) as avg_processing_time,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as error_count
      FROM messages
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY time_bucket DESC
    `;

    const result = await this.pool.query(query, [startDate, endDate]);
    return {
      type: REPORT_TYPES.SYSTEM_PERFORMANCE,
      data: result.rows,
      summary: this.summarizeSystemPerformance(result.rows),
    };
  }

  // Summary helper methods
  summarizePatternFrequency(data) {
    // Implement summary logic
    return {
      totalPatterns: data.reduce((sum, row) => sum + Number(row.frequency), 0),
      topPatterns: data.slice(0, 5),
      dateRange: {
        start: Math.min(...data.map((row) => new Date(row.date))),
        end: Math.max(...data.map((row) => new Date(row.date))),
      },
    };
  }

  summarizeUserInteractions(data) {
    // Implement summary logic
    return {
      totalUsers: data.length,
      totalInteractions: data.reduce((sum, row) => sum + Number(row.total_interactions), 0),
      avgProcessingTime:
        data.reduce((sum, row) => sum + Number(row.avg_processing_time), 0) / data.length,
      avgActiveDays: data.reduce((sum, row) => sum + Number(row.active_days), 0) / data.length,
    };
  }

  summarizeCrisisAlerts(data) {
    // Implement summary logic
    return {
      totalAlerts: data.length,
      resolvedAlerts: data.filter((row) => row.resolution_status === 'resolved').length,
      avgResolutionTime: this.calculateAvgResolutionTime(data),
      recentAlerts: data.slice(0, 5),
    };
  }

  summarizeConsciousnessStates(data) {
    // Implement summary logic
    return {
      totalStates: data.reduce((sum, row) => sum + Number(row.frequency), 0),
      dominantState: data.sort((a, b) => b.frequency - a.frequency)[0],
      avgProcessingTime:
        data.reduce((sum, row) => sum + Number(row.avg_processing_time), 0) / data.length,
    };
  }

  summarizeAdaptiveCodes(data) {
    // Implement summary logic
    return {
      totalDetections: data.reduce((sum, row) => sum + Number(row.frequency), 0),
      uniqueUsers: data.reduce((sum, row) => sum + Number(row.unique_users), 0),
      topCodes: data.slice(0, 5),
    };
  }

  summarizeSystemPerformance(data) {
    // Implement summary logic
    return {
      totalRequests: data.reduce((sum, row) => sum + Number(row.total_requests), 0),
      avgProcessingTime:
        data.reduce((sum, row) => sum + Number(row.avg_processing_time), 0) / data.length,
      errorRate:
        data.reduce((sum, row) => sum + Number(row.error_count), 0) /
        data.reduce((sum, row) => sum + Number(row.total_requests), 0),
      peakUsage: Math.max(...data.map((row) => Number(row.total_requests))),
    };
  }

  calculateAvgResolutionTime(data) {
    const resolvedAlerts = data.filter(
      (row) => row.resolution_status === 'resolved' && row.resolution_time
    );
    if (resolvedAlerts.length === 0) return null;

    return (
      resolvedAlerts.reduce((sum, row) => sum + Number(row.resolution_time), 0) /
      resolvedAlerts.length
    );
  }
}

module.exports = {
  ReportsManager,
  REPORT_TYPES,
};
