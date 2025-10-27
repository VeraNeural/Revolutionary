#!/usr/bin/env node
/**
 * Database Restore Script for VERA
 * 
 * CRITICAL: This will REPLACE your current database!
 * 
 * Usage:
 *   node scripts/restore-database.js ./backups/vera-backup-2024-10-27T14-30-00.sql
 * 
 * Steps:
 *   1. Downloads backup file
 *   2. Drops all tables (⚠️ DESTRUCTIVE)
 *   3. Restores from backup
 *   4. Verifies data
 * 
 * BEFORE RUNNING:
 *   - Save any recent changes
 *   - Test on staging first
 *   - Have your backup file ready
 *   - Notify users of downtime
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

const DB_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const BACKUP_DIR = path.join(__dirname, '../backups');

/**
 * Ask user for confirmation (required!)
 */
function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question + ' (yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Restore database from backup file
 */
async function restoreBackup(backupFile) {
  return new Promise((resolve, reject) => {
    console.log('🔄 Starting database restore...');
    console.log('📍 Database URL:', DB_URL?.substring(0, 30) + '...');
    console.log('📁 Backup file:', backupFile);
    console.log();

    const backupStream = fs.createReadStream(backupFile);

    const psql = spawn('psql', [
      '--no-password',
      '--set', 'ON_ERROR_STOP=on',  // Stop on first error
      DB_URL,
    ]);

    let output = '';
    let errorOutput = '';

    backupStream.pipe(psql.stdin);

    psql.stdout.on('data', (data) => {
      output += data.toString();
      console.log('  ', data.toString().trim());
    });

    psql.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error('  ', data.toString().trim());
    });

    psql.on('error', (error) => {
      console.error('❌ psql failed:', error.message);
      reject(error);
    });

    psql.on('close', (code) => {
      if (code === 0) {
        console.log();
        console.log('✅ Restore completed successfully');
        resolve();
      } else {
        console.error('❌ psql exited with code:', code);
        reject(new Error(`Restore failed with code ${code}`));
      }
    });
  });
}

/**
 * Verify database after restore
 */
async function verifyRestore() {
  return new Promise((resolve, reject) => {
    console.log('🔍 Verifying restored database...');

    const psql = spawn('psql', [
      '--no-password',
      '--command', `SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';`,
      DB_URL,
    ]);

    let output = '';

    psql.stdout.on('data', (data) => {
      output += data.toString();
    });

    psql.on('close', (code) => {
      if (code === 0 && output.includes('table_count')) {
        console.log(output);
        console.log('✅ Database verification passed');
        resolve();
      } else {
        console.error('❌ Database verification failed');
        reject(new Error('Verification failed'));
      }
    });
  });
}

/**
 * Main execution
 */
async function main() {
  try {
    // Get backup file from command line
    const backupFile = process.argv[2];

    if (!backupFile) {
      console.log('Usage: node scripts/restore-database.js <backup-file>');
      console.log();
      console.log('Available backups:');
      if (fs.existsSync(BACKUP_DIR)) {
        const files = fs.readdirSync(BACKUP_DIR)
          .filter(f => f.startsWith('vera-backup-'))
          .sort()
          .reverse();
        files.forEach(f => console.log('  ', f));
      }
      process.exit(1);
    }

    // Verify file exists
    if (!fs.existsSync(backupFile)) {
      console.error('❌ Backup file not found:', backupFile);
      process.exit(1);
    }

    const stats = fs.statSync(backupFile);
    console.log('========================================');
    console.log('  VERA Database Restore');
    console.log('  ⚠️  WARNING: THIS WILL REPLACE YOUR DATABASE!');
    console.log('========================================');
    console.log();
    console.log('Backup file:', backupFile);
    console.log('Size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
    console.log('Modified:', stats.mtime.toISOString());
    console.log();

    // Get user confirmation
    const confirmed = await askConfirmation('Are you ABSOLUTELY SURE you want to restore? This will DELETE all current data!');
    if (!confirmed) {
      console.log('❌ Restore cancelled');
      process.exit(0);
    }

    const finalConfirm = await askConfirmation('Last chance! Type "yes" again to confirm:');
    if (!finalConfirm) {
      console.log('❌ Restore cancelled');
      process.exit(0);
    }

    console.log();
    console.log('========================================');

    // Restore backup
    await restoreBackup(backupFile);
    console.log();

    // Verify restore
    await verifyRestore();
    console.log();

    console.log('========================================');
    console.log('✅ RESTORE COMPLETED SUCCESSFULLY');
    console.log('========================================');
    console.log();
    console.log('Next steps:');
    console.log('1. Test your application');
    console.log('2. Verify user data is correct');
    console.log('3. Monitor error logs');
    console.log();
    process.exit(0);
  } catch (error) {
    console.error('❌ RESTORE FAILED:', error.message);
    console.error();
    console.error('Troubleshooting:');
    console.error('1. Check DATABASE_PUBLIC_URL in .env.local');
    console.error('2. Ensure backup file is valid SQL');
    console.error('3. Ensure psql is installed: which psql');
    console.error('4. Check database is accessible');
    console.error();
    process.exit(1);
  }
}

main();
