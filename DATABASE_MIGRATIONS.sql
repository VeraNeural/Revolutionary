-- ==================== MAGIC LINK DATABASE MIGRATIONS ====================
-- Run these SQL commands in your Railway PostgreSQL database to set up the required tables
-- Copy and paste each CREATE TABLE section into the Railway database console

-- ==================== TABLE 1: MAGIC LINKS ====================
-- Stores magic link tokens with their lifecycle
CREATE TABLE IF NOT EXISTS magic_links (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  used_by_ip VARCHAR(50)
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);

-- Index for querying tokens by email
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

-- Index for finding active (non-expired, non-used) tokens
CREATE INDEX IF NOT EXISTS idx_magic_links_active ON magic_links(email, expires_at, used);

-- ==================== TABLE 2: EMAIL DELIVERY LOGS ====================
-- Tracks all email delivery attempts with status and retry information
CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id SERIAL PRIMARY KEY,
  email_address VARCHAR(255) NOT NULL,
  email_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  attempt_count INT DEFAULT 1,
  error_message TEXT,
  resend_id VARCHAR(255),
  last_attempted_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for finding logs by email (admin queries)
CREATE INDEX IF NOT EXISTS idx_email_logs_email ON email_delivery_logs(email_address);

-- Index for finding pending emails (retry system)
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_delivery_logs(status);

-- Index for grouping by email type
CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_delivery_logs(email_type);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_delivery_logs(created_at);

-- ==================== TABLE 3: LOGIN AUDIT LOG ====================
-- Tracks all login attempts for security and debugging
CREATE TABLE IF NOT EXISTS login_audit_log (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  token_id INTEGER REFERENCES magic_links(id),
  action VARCHAR(50),
  ip_address VARCHAR(50),
  user_agent TEXT,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for finding logs by email (admin queries)
CREATE INDEX IF NOT EXISTS idx_login_audit_email ON login_audit_log(email);

-- Index for grouping by action
CREATE INDEX IF NOT EXISTS idx_login_audit_action ON login_audit_log(action);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_login_audit_created ON login_audit_log(created_at);

-- Index for finding failed attempts (security monitoring)
CREATE INDEX IF NOT EXISTS idx_login_audit_success ON login_audit_log(success);

-- ==================== VERIFICATION QUERIES ====================
-- Use these to verify the tables were created correctly

-- Check magic_links table exists and has correct schema
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'magic_links' ORDER BY ordinal_position;

-- Check email_delivery_logs table exists and has correct schema
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'email_delivery_logs' ORDER BY ordinal_position;

-- Check login_audit_log table exists and has correct schema
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'login_audit_log' ORDER BY ordinal_position;

-- Count records in each table
-- SELECT 'magic_links' as table_name, COUNT(*) FROM magic_links
-- UNION ALL
-- SELECT 'email_delivery_logs', COUNT(*) FROM email_delivery_logs
-- UNION ALL
-- SELECT 'login_audit_log', COUNT(*) FROM login_audit_log;

-- ==================== HOW TO RUN THESE MIGRATIONS ====================

-- METHOD 1: Via Railway Dashboard (Recommended)
-- 1. Go to https://railway.app
-- 2. Select your project
-- 3. Click on PostgreSQL database
-- 4. Click "Connect" tab
-- 5. Click "Query" button
-- 6. Copy and paste each CREATE TABLE section above
-- 7. Click "Run Query"

-- METHOD 2: Via psql command line
-- psql "$DATABASE_URL" -f DATABASE_MIGRATIONS.sql

-- METHOD 3: Via direct SQL execution
-- Replace $DATABASE_URL with your actual connection string
-- psql $DATABASE_URL < DATABASE_MIGRATIONS.sql

-- ==================== TESTING ====================

-- After running migrations, verify they exist:
-- \dt  (lists all tables)

-- View table structure:
-- \d magic_links
-- \d email_delivery_logs
-- \d login_audit_log

-- View indexes:
-- \di idx_*

-- ==================== CLEANUP (if needed) ====================
-- ONLY run these if you want to delete the tables (WARNING: DATA LOSS!)
-- DROP TABLE IF EXISTS login_audit_log CASCADE;
-- DROP TABLE IF EXISTS email_delivery_logs CASCADE;
-- DROP TABLE IF EXISTS magic_links CASCADE;
