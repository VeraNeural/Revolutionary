# DEPLOYMENT GUIDE - Magic Link Authentication Fix

## ⚡ CRITICAL: This document provides exact steps to deploy the magic link authentication fixes to production

---

## PHASE 1: DATABASE SETUP

### Step 1: Access Railway PostgreSQL Database

1. Go to https://railway.app
2. Select your VERA project
3. In the left sidebar, click on "PostgreSQL"
4. Click the "Connect" tab

### Step 2: Create Database Tables

Copy and paste the following SQL into the Railway Query editor. Run each CREATE TABLE statement:

```sql
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

CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);
CREATE INDEX IF NOT EXISTS idx_magic_links_active ON magic_links(email, expires_at, used);
```

**Wait for completion (green checkmark)**

```sql
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

CREATE INDEX IF NOT EXISTS idx_email_logs_email ON email_delivery_logs(email_address);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_delivery_logs(email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_delivery_logs(created_at);
```

**Wait for completion (green checkmark)**

```sql
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

CREATE INDEX IF NOT EXISTS idx_login_audit_email ON login_audit_log(email);
CREATE INDEX IF NOT EXISTS idx_login_audit_action ON login_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_login_audit_created ON login_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_login_audit_success ON login_audit_log(success);
```

**Wait for completion (green checkmark)**

### Step 3: Verify Tables Were Created

Run this query to confirm all tables exist:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('magic_links', 'email_delivery_logs', 'login_audit_log');
```

**Expected output: 3 rows with the table names**

---

## PHASE 2: ENVIRONMENT VARIABLES

### Step 1: Set ADMIN_EMAIL

The admin monitoring endpoints require authentication. Set the admin email:

1. In Railway project, click on **Settings** (gear icon)
2. Click **Environment** 
3. Add new variable:
   ```
   ADMIN_EMAIL=your-email@example.com
   ```
   (Replace with your actual email address)
4. Click **Save**

**Railway will automatically redeploy the app**

---

## PHASE 3: CODE DEPLOYMENT

### Step 1: Verify Git Commit

Check that the code changes are committed:

```bash
cd c:\Users\elvec\Desktop\vera-project
git log --oneline -1
```

**Expected output should show: "Implement enhanced magic link authentication system"**

### Step 2: Push to Railway

```bash
git push origin main
```

**Railway will automatically build and deploy**

### Step 3: Monitor Deployment

1. In Railway, click on your app service
2. Click **Deployments** tab
3. Watch for new deployment to complete (check mark)
4. Click on the latest deployment to view logs

**Look for errors - should see "✅ Server listening"**

---

## PHASE 4: POST-DEPLOYMENT VERIFICATION

### Verification 1: Check Logs

In Railway deployments, verify these messages appear in the logs:

```
✅ Server listening on port 8080
🔄 Magic link retry system started
```

### Verification 2: Test Magic Link Request (CRITICAL)

```bash
curl -X POST http://localhost:8080/api/auth/send-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Check your email for the sign-in link. It expires in 15 minutes.",
  "logId": "some-number"
}
```

### Verification 3: Check Email Delivery Logs

Query the database to verify email was logged:

```sql
SELECT email_address, status, created_at FROM email_delivery_logs 
ORDER BY created_at DESC LIMIT 5;
```

**Expected: Row with status='sent' or 'pending'**

### Verification 4: Test Admin Endpoints (Optional)

If you set ADMIN_EMAIL correctly, you can test:

```bash
curl http://localhost:8080/api/admin/email-status/test@example.com \
  -H "Cookie: sessionid=your-session-cookie"
```

**Expected:**
```json
{
  "email": "test@example.com",
  "stats": {
    "totalEmails": 1,
    "sentCount": 1,
    "failedCount": 0,
    "successRate": "100%"
  }
}
```

---

## PHASE 5: PRODUCTION TESTING

### Complete End-to-End Flow

1. **Request Magic Link**
   - Go to login.html
   - Enter a test email (make sure it exists in users table)
   - Click "Send Sign-In Link"

2. **Check Email Logs**
   ```sql
   SELECT * FROM email_delivery_logs 
   WHERE email_address='test@example.com' 
   ORDER BY created_at DESC LIMIT 1;
   ```
   - Verify status is 'sent' or 'pending'
   - If 'failed', check error_message column

3. **Check Magic Link Token**
   ```sql
   SELECT token, expires_at, used FROM magic_links 
   WHERE email='test@example.com' 
   ORDER BY created_at DESC LIMIT 1;
   ```
   - Verify `used` is false
   - Verify `expires_at` is in the future

4. **Click Magic Link**
   - Get token from above query
   - Visit: `http://localhost:8080/verify-magic-link?token=TOKEN`
   - Should redirect to /chat.html
   - Session should be created

5. **Check Login Audit Log**
   ```sql
   SELECT action, success FROM login_audit_log 
   WHERE email='test@example.com' 
   ORDER BY created_at DESC LIMIT 5;
   ```
   - Should see: `login_successful` with success=true

---

## PHASE 6: ROLLBACK PLAN (If Issues)

### If Code Has Bugs

```bash
# Revert to previous commit
git revert HEAD
git push origin main
# Railway will auto-redeploy
```

### If Database Issues

```bash
# DO NOT delete the tables - data is valuable
# Instead, clear test data:
DELETE FROM login_audit_log WHERE email LIKE '%test%';
DELETE FROM email_delivery_logs WHERE email_address LIKE '%test%';
DELETE FROM magic_links WHERE email LIKE '%test%';
```

---

## PHASE 7: MONITORING

### Daily Checks

Run these queries to verify system health:

```sql
-- Email delivery success rate
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as sent,
  ROUND(100.0 * SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate_pct
FROM email_delivery_logs 
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Failed emails (last 24h)
SELECT email_address, error_message, attempt_count 
FROM email_delivery_logs 
WHERE status='failed' AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Failed logins (last 24h)
SELECT email, action, error_message, ip_address, created_at
FROM login_audit_log
WHERE success=false AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Pending emails (should be low)
SELECT COUNT(*) as pending_count, 
  MAX(last_attempted_at) as oldest_pending
FROM email_delivery_logs 
WHERE status='pending';
```

### Check Sentry Alerts

1. Go to https://sentry.io
2. Select your VERA project
3. Look for errors in these areas:
   - `/api/auth/send-magic-link`
   - `/verify-magic-link`
   - `createMagicLink`
   - `sendEmail`

**Target: 0 errors from magic link endpoints**

---

## TROUBLESHOOTING

### Issue: Users Not Receiving Emails

**Debug Steps:**
```sql
-- Check if email was logged
SELECT * FROM email_delivery_logs 
WHERE email_address='user@example.com' 
ORDER BY created_at DESC LIMIT 5;

-- If status='pending', retry manually
SELECT * FROM email_delivery_logs 
WHERE status='pending' AND last_attempted_at < NOW() - INTERVAL '1 minute'
ORDER BY last_attempted_at ASC LIMIT 10;

-- Check Resend API status
SELECT resend_id, error_message FROM email_delivery_logs 
WHERE email_address='user@example.com' AND status='failed'
ORDER BY created_at DESC LIMIT 1;
```

### Issue: Magic Link Expired Immediately

**Debug Steps:**
```sql
-- Check token expiration
SELECT token, expires_at, NOW(), 
  (expires_at - NOW()) as time_remaining
FROM magic_links 
WHERE email='user@example.com' 
ORDER BY created_at DESC LIMIT 1;

-- If time_remaining is negative, token expired
-- Time should be ~15 minutes
```

### Issue: Token Not Found After Clicking

**Debug Steps:**
```sql
-- Check if token exists
SELECT * FROM magic_links WHERE token='TOKEN_HERE';

-- Check if it was already used
SELECT used, used_at FROM magic_links WHERE token='TOKEN_HERE';

-- Check audit log for clues
SELECT action, error_message FROM login_audit_log 
WHERE email='user@example.com' 
ORDER BY created_at DESC LIMIT 10;
```

### Issue: Admin Endpoints Return 403 Unauthorized

**Debug Steps:**
- Verify `ADMIN_EMAIL` environment variable is set correctly
- Make sure you're logged in with that email
- Check session cookie is being sent
- Verify exact email match (case-insensitive)

---

## NEXT STEPS AFTER DEPLOYMENT

1. ✅ **Monitor**: Watch email delivery for 24 hours
2. ✅ **Test**: Have some users test the complete flow
3. ✅ **Notify**: Let team know magic link system is fixed
4. ✅ **Document**: Update runbooks with admin endpoint URLs
5. ✅ **Alert**: Set up Sentry alerts for magic link failures

---

## SUPPORT CONTACTS

- **Magic Link Issues**: Check MAGIC_LINK_TROUBLESHOOTING.md
- **Database Issues**: Contact Railway support
- **Email Delivery**: Check Resend.com dashboard
- **Security Issues**: Contact Sentry with error link

---

## DEPLOYMENT CHECKLIST

- [ ] Database tables created successfully
- [ ] ADMIN_EMAIL environment variable set
- [ ] Code changes deployed to production
- [ ] Server is running without errors
- [ ] Test magic link works end-to-end
- [ ] Email delivery logs show success
- [ ] Login audit log shows successful login
- [ ] Admin endpoints accessible
- [ ] Sentry has no new errors
- [ ] Team notified of changes

**Once all checkboxes are done, the magic link authentication fix is complete!**
