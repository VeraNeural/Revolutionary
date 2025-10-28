#!/usr/bin/env node
/**
 * Database Backup Script for VERA
 *
 * Usage:
 *   - Manual: node scripts/backup-database.js
 *   - Scheduled: Add to cron or Railway task
 *
 * Creates timestamped SQL backup file in ./backups/ directory
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const pg = require('pg');
require('dotenv').config({ path: '.env.local' });

// Configuration
const BACKUP_DIR = path.join(__dirname, '../backups');
const DB_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const TIMESTAMP = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const BACKUP_FILE = path.join(BACKUP_DIR, `vera-backup-${TIMESTAMP}.sql`);
const RETENTION_DAYS = 7; // Keep backups for 7 days

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log('✅ Created backups directory:', BACKUP_DIR);
}

/**
 * Create a backup using pg_dump
 */
async function createBackup() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting database backup...');
    console.log('📍 Database URL:', DB_URL?.substring(0, 30) + '...');
    console.log('💾 Backup file:', BACKUP_FILE);

    const backupStream = fs.createWriteStream(BACKUP_FILE);

    const pgDump = spawn('pg_dump', [
      '--verbose',
      '--no-password',
      '--clean', // Drop objects before recreating
      '--if-exists', // Drop if exists
      '--format=plain', // SQL text format
      '--compress=0', // No compression (easier to restore)
      '--no-acl', // Don't backup permissions
      DB_URL,
    ]);

    const output = '';
    let errorOutput = '';

    pgDump.stdout.pipe(backupStream);

    pgDump.stderr.on('data', (data) => {
      errorOutput += data.toString();
      // pg_dump outputs useful progress info to stderr, not errors
      if (data.toString().includes('TABLE') || data.toString().includes('INDEX')) {
        console.log('  ', data.toString().trim());
      }
    });

    pgDump.on('error', (error) => {
      console.error('❌ pg_dump failed:', error.message);
      reject(error);
    });

    pgDump.on('close', (code) => {
      if (code === 0) {
        const stats = fs.statSync(BACKUP_FILE);
        console.log('✅ Backup completed successfully');
        console.log('📦 Backup size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
        console.log('💾 File:', BACKUP_FILE);
        resolve();
      } else {
        console.error('❌ pg_dump exited with code:', code);
        console.error('Error output:', errorOutput);
        reject(new Error(`pg_dump exited with code ${code}`));
      }
    });

    backupStream.on('error', (error) => {
      console.error('❌ File write error:', error.message);
      reject(error);
    });
  });
}

/**
 * Clean up old backups (older than RETENTION_DAYS)
 */
async function cleanupOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR);
  const now = Date.now();
  const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;

  let deletedCount = 0;

  files.forEach((file) => {
    if (!file.startsWith('vera-backup-')) return;

    const filePath = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(filePath);
    const age = now - stat.mtimeMs;

    if (age > maxAge) {
      fs.unlinkSync(filePath);
      console.log('🗑️  Deleted old backup:', file);
      deletedCount++;
    }
  });

  if (deletedCount === 0) {
    console.log('✅ No old backups to clean up');
  }
}

/**
 * Verify backup integrity
 */
async function verifyBackup() {
  try {
    const content = fs.readFileSync(BACKUP_FILE, 'utf8');

    // Check for required SQL statements
    const hasCreateTable = content.includes('CREATE TABLE');
    const hasInsert = content.includes('INSERT INTO') || content.includes('COPY');

    if (hasCreateTable) {
      console.log('✅ Backup verified: Contains table definitions');
      return true;
    } else {
      console.warn('⚠️  Backup might be incomplete (no CREATE TABLE found)');
      return false;
    }
  } catch (error) {
    console.error('❌ Could not verify backup:', error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('========================================');
    console.log('  VERA Database Backup');
    console.log('  Time:', new Date().toISOString());
    console.log('========================================');
    console.log();

    // Create backup
    await createBackup();
    console.log();

    // Verify backup
    await verifyBackup();
    console.log();

    // Cleanup old backups
    await cleanupOldBackups();
    console.log();

    console.log('========================================');
    console.log('✅ BACKUP PROCESS COMPLETED');
    console.log('========================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ BACKUP FAILED:', error.message);
    console.error();
    console.error('Troubleshooting:');
    console.error('1. Check DATABASE_PUBLIC_URL in .env.local');
    console.error('2. Ensure pg_dump is installed: which pg_dump');
    console.error('3. Test connection: psql $DATABASE_PUBLIC_URL');
    console.error();
    process.exit(1);
  }
}

main();
