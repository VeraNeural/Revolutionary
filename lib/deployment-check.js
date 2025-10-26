const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

class DeploymentChecker {
  constructor() {
    this.checks = [];
    this.errors = [];
    this.warnings = [];
  }

  async runAllChecks() {
    console.log('🔍 Running deployment checks...');
    
    // Environment variables check
    this.checkRequiredEnvVars([
      'DATABASE_URL',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'ANTHROPIC_API_KEY',
      'SESSION_SECRET',
      'APP_URL',
      'PORT',
      'NODE_ENV'
    ]);

    // Database connection check
    await this.checkDatabaseConnection();

    // File existence check
    this.checkRequiredFiles([
      'server.js',
      'lib/vera-ai.js',
      'lib/database-manager.js',
      'lib/rate-limiter.js',
      'public/index.html',
      'public/chat.html'
    ]);

    // Dependencies check
    this.checkDependencies();

    // Security checks
    this.runSecurityChecks();

    return this.generateReport();
  }

  checkRequiredEnvVars(requiredVars) {
    const envPath = path.join(process.cwd(), '.env.local');
    const envVars = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : process.env;

    requiredVars.forEach(varName => {
      if (!envVars[varName]) {
        this.errors.push(`Missing required environment variable: ${varName}`);
      }
    });
  }

  async checkDatabaseConnection() {
    try {
      const db = require('./database-manager');
      await db.query('SELECT NOW()');
      this.checks.push('Database connection successful');
    } catch (error) {
      this.errors.push(`Database connection failed: ${error.message}`);
    }
  }

  checkRequiredFiles(files) {
    files.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        this.errors.push(`Missing required file: ${file}`);
      }
    });
  }

  checkDependencies() {
    try {
      const packageJson = require('../package.json');
      const requiredDeps = [
        '@anthropic-ai/sdk',
        'express',
        'stripe',
        'pg',
        'connect-pg-simple',
        'dotenv'
      ];

      requiredDeps.forEach(dep => {
        if (!packageJson.dependencies[dep]) {
          this.errors.push(`Missing required dependency: ${dep}`);
        }
      });
    } catch (error) {
      this.errors.push('Failed to read package.json');
    }
  }

  runSecurityChecks() {
    // Check session configuration
    try {
      const serverJs = fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');
      if (!serverJs.includes('secure: process.env.NODE_ENV === "production"')) {
        this.warnings.push('Session cookie security not configured for production');
      }
    } catch (error) {
      this.warnings.push('Could not verify session security configuration');
    }
  }

  generateReport() {
    return {
      success: this.errors.length === 0,
      checks: this.checks,
      errors: this.errors,
      warnings: this.warnings,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = DeploymentChecker;