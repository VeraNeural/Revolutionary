#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * Reads DATABASE_MIGRATIONS.sql and executes each statement sequentially.
 * 
 * Usage:
 *   node run-migrations.js              (uses DATABASE_URL env var)
 *   DATABASE_URL=... node run-migrations.js
 * 
 * Features:
 *   - Idempotent (safe to run multiple times)
 *   - Handles CREATE TABLE IF NOT EXISTS
 *   - Creates indexes safely
 *   - Detailed logging with emoji indicators
 *   - Exits with code 0 on success, 1 on failure
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ==================== CONFIGURATION ====================

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS_FILE = path.join(__dirname, 'DATABASE_MIGRATIONS.sql');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

// ==================== LOGGING UTILITIES ====================

function log(message) {
  console.log(message);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`);
}

function logSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function logError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

// ==================== VALIDATION ====================

async function validateEnvironment() {
  if (!DATABASE_URL) {
    logError('DATABASE_URL environment variable is not set');
    logInfo('Set DATABASE_URL and try again:');
    log('  export DATABASE_URL="postgresql://user:pass@host:port/db"');
    process.exit(1);
  }

  if (!fs.existsSync(MIGRATIONS_FILE)) {
    logError(`Migrations file not found: ${MIGRATIONS_FILE}`);
    process.exit(1);
  }

  logSuccess(`Environment variables validated`);
}

// ==================== SQL PARSING ====================

function parseSqlStatements(sqlContent) {
  // Split by semicolon, but be careful with comments
  let statements = [];
  let currentStatement = '';
  let inComment = false;

  const lines = sqlContent.split('\n');

  for (const line of lines) {
    // Skip comment lines
    if (line.trim().startsWith('--')) {
      continue;
    }

    // Add line to current statement
    currentStatement += line + '\n';

    // If line ends with semicolon, we have a complete statement
    if (line.includes(';')) {
      const trimmed = currentStatement.trim();
      if (trimmed && trimmed !== ';') {
        statements.push(trimmed);
      }
      currentStatement = '';
    }
  }

  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements.filter(stmt => stmt.length > 0);
}

// ==================== MIGRATION EXECUTION ====================

async function runMigrations() {
  logInfo('Starting database migrations...\n');

  // Read migrations file
  let migrationContent;
  try {
    migrationContent = fs.readFileSync(MIGRATIONS_FILE, 'utf8');
    logSuccess(`Loaded migrations file (${migrationContent.length} bytes)`);
  } catch (error) {
    logError(`Failed to read migrations file: ${error.message}`);
    process.exit(1);
  }

  // Parse SQL statements
  const statements = parseSqlStatements(migrationContent);
  logSuccess(`Parsed ${statements.length} SQL statements\n`);

  // Connect to database
  const pool = new Pool({
    connectionString: DATABASE_URL,
    statement_timeout: 30000,
  });

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  try {
    logInfo('Connecting to database...');
    const client = await pool.connect();
    logSuccess('Connected to database\n');

    logInfo('Executing migrations:\n');

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const statementNumber = i + 1;

      // Get first line for logging
      const firstLine = statement.split('\n')[0].substring(0, 60);

      try {
        await client.query(statement);

        // Detect what was executed
        if (statement.includes('CREATE TABLE')) {
          logSuccess(`[${statementNumber}/${statements.length}] Created table`);
        } else if (statement.includes('CREATE INDEX')) {
          logSuccess(`[${statementNumber}/${statements.length}] Created index`);
        } else if (statement.includes('SELECT')) {
          logSuccess(`[${statementNumber}/${statements.length}] Query executed`);
        } else {
          logSuccess(`[${statementNumber}/${statements.length}] Statement executed`);
        }

        successCount++;
      } catch (error) {
        // Handle common "already exists" errors gracefully
        if (
          error.message.includes('already exists') ||
          error.message.includes('duplicate key') ||
          error.code === '42P07' || // relation already exists
          error.code === '42P15'    // unique constraint already exists
        ) {
          logWarning(`[${statementNumber}/${statements.length}] Already exists (skipped)`);
          skipCount++;
        } else {
          logError(`[${statementNumber}/${statements.length}] ${error.message}`);
          errorCount++;
        }
      }
    }

    client.release();
    log('');

    // Summary
    logInfo('Migration Summary:');
    logSuccess(`  ${successCount} statements executed`);
    if (skipCount > 0) {
      logWarning(`  ${skipCount} statements skipped (already exist)`);
    }
    if (errorCount > 0) {
      logError(`  ${errorCount} statements failed`);
    }

    if (errorCount > 0) {
      logError('\nMigrations completed with errors');
      await pool.end();
      process.exit(1);
    } else {
      logSuccess('\nMigrations completed successfully');
      await pool.end();
      process.exit(0);
    }
  } catch (error) {
    logError(`Database error: ${error.message}`);
    await pool.end();
    process.exit(1);
  }
}

// ==================== MAIN ====================

async function main() {
  try {
    await validateEnvironment();
    log('');
    await runMigrations();
  } catch (error) {
    logError(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { runMigrations, parseSqlStatements };
