#!/usr/bin/env node

const { ReportsManager, REPORT_TYPES } = require('./reports-manager');
const { Pool } = require('pg');
require('dotenv').config();

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const reportsManager = new ReportsManager(pool);

async function main() {
  const args = process.argv.slice(2);
  const reportType = args[0];
  
  if (!reportType || !Object.values(REPORT_TYPES).includes(reportType)) {
    console.log('Available report types:');
    Object.entries(REPORT_TYPES).forEach(([key, value]) => {
      console.log(`  ${value} - ${getReportDescription(value)}`);
    });
    process.exit(1);
  }

  try {
    // Parse date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Default to last 30 days

    // Generate and display report
    console.log(`Generating ${reportType} report...`);
    const report = await reportsManager.generateReport(reportType, {
      startDate,
      endDate,
      limit: 100
    });

    console.log('\nReport Summary:');
    console.log(JSON.stringify(report.summary, null, 2));

    console.log('\nDetailed Data:');
    console.table(report.data);

  } catch (error) {
    console.error('Error generating report:', error);
    process.exit(1);
  }

  await pool.end();
}

function getReportDescription(type) {
  const descriptions = {
    [REPORT_TYPES.PATTERN_FREQUENCY]: 'Analyze frequency of detected patterns over time',
    [REPORT_TYPES.USER_INTERACTIONS]: 'Review user interaction metrics and engagement',
    [REPORT_TYPES.CRISIS_ALERTS]: 'Summary of crisis alerts and resolutions',
    [REPORT_TYPES.CONSCIOUSNESS_STATE]: 'Distribution of consciousness states',
    [REPORT_TYPES.ADAPTIVE_CODES]: 'Analysis of adaptive code occurrences',
    [REPORT_TYPES.SYSTEM_PERFORMANCE]: 'System performance metrics and error rates'
  };
  return descriptions[type] || 'No description available';
}

main().catch(console.error);