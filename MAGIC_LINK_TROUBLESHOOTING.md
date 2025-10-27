# MAGIC LINK TROUBLESHOOTING PLAYBOOK

## Step-by-Step Debugging Guide for Authentication Issues

---

## SCENARIO 1: User Says "I Didn't Receive My Magic Link"

### Step 1: Check Email Delivery Logs

**What to do:**

1. Sign in as admin (ADMIN_EMAIL)
2. Go to: `/api/admin/email-status/user@example.com`
3. Look at the response

**What to look for:**

```json
{
  "email": "user@example.com",
  "stats": {
    "totalEmails": 3,
    "sentCount": 1,
    "failedCount": 2,
    "pendingCount": 0,
    "successRate": "33.3%"
  },
  "logs": [
    {
      "id": 42,
      "email_address": "user@example.com",
      "email_type": "magic_link",
      "status": "failed",
      "attempt_count": 1,
      "error_message": "RESEND_API_KEY not configured",
      "created_at": "2025-10-27T14:30:00Z"
    }
  ]
}
```

**Interpretation:**

- `status: "sent"` → Email was delivered successfully ✅
- `status: "failed"` → Email failed to send ❌
- `status: "pending"` → Still trying to send (wait 5 minutes for retry)
- `error_message` tells you exactly why it failed

### Step 2: Check the Specific Error

**If error is: "RESEND_API_KEY not configured"**

- Fix: Add `RESEND_API_KEY` to Railway environment variables
- Restart server

**If error is: "Invalid email format"**

- Fix: User entered invalid email (e.g., "user@" or "user@.com")
- Ask user to try again with correct email

**If error is: "Failed after 3 retries"**

- This means the email service is down or unreachable
- Check Resend.com status
- System will retry automatically every 5 minutes

**If error is something else:**

- It's in the `error_message` field
- Google the error message
- Or report to support with the error_message

### Step 3: Manually Resend the Magic Link

If email delivery eventually succeeds, great!  
If it continues to fail after 30+ minutes, manually resend:

```bash
curl -X POST http://your-domain/api/admin/resend-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}' \
  -H "Cookie: connect.sid=[session-cookie]"
```

Or use the admin endpoint response to get the direct link.

### Step 4: Check User's Email Configuration

- Is their email provider accepting emails from Resend?
- Check spam/junk folder
- Ask them to whitelist: noreply@resend.com
- Try a different email address

---

## SCENARIO 2: User Got Email But Link Doesn't Work

### Step 1: Check If Link Is Valid

The magic link should be formatted like:

```
https://app.veraneural.com/verify-magic-link?token=abc123def456...
```

**Check if:**

- Domain is correct (should be your APP_URL)
- Token is included after `?token=`
- No line breaks or extra spaces

### Step 2: Check Token Status

**Query the database:**

```sql
SELECT id, email, token, created_at, expires_at, used, used_at
FROM magic_links
WHERE token = 'abc123def456...'
LIMIT 1;
```

**Look for:**

- `created_at` → When was token created? (If > 15 min ago, it's expired)
- `expires_at` → When does it expire? (Compare to current time)
- `used: true` → Was token already used? (Can only use once!)
- `used_at` → When was it used?

### Step 3: Interpret Results

**If token doesn't exist:**

- Wrong token in link
- Email/link was corrupted in transmission
- Solution: Have user request new magic link

**If token is expired (expires_at < NOW()):**

- Token was created more than 15 minutes ago
- User took too long to click link
- Solution: Have user request new magic link

**If token is already used (used = true):**

- Token was already used to log in
- User might have clicked it twice
- Solution: User should be already logged in. If not, they need new token.

**If token is valid but expired_at > NOW() and used = false:**

- Token SHOULD work
- Problem might be with session creation
- Check Step 4

### Step 4: Check Login Audit Log

```sql
SELECT id, email, token_id, action, success, error_message, created_at
FROM login_audit_log
WHERE LOWER(email) = 'user@example.com'
ORDER BY created_at DESC
LIMIT 50;
```

**Look for actions in order:**

1. `token_created` ✅
2. `magic_link_email_sent` ✅
3. `token_verified` ✅
4. `session_created` ✅
5. `login_successful` ✅

**If action stops at `token_verified` but no `session_created`:**

- Session creation failed
- User's browser might not be accepting cookies
- Check browser console for errors

**If action shows error:**

- `error_message` field tells you what went wrong
- Can usually fix by having user request new link

---

## SCENARIO 3: Magic Link Works But User Isn't Logged In

### Step 1: Check Session Status

When user successfully clicks link, they should be redirected to `/chat.html`.

**If they see /chat.html but can't chat:**

- Their browser might not have the session cookie
- Session might have expired
- Database session table might have issues

### Step 2: Check Session Table

```sql
SELECT sid, expire
FROM session
WHERE sess LIKE '%your@email.com%'
ORDER BY expire DESC
LIMIT 5;
```

**Look for:**

- `expire` → When does session expire? (Should be in future)
- `sid` → Session ID should exist
- If no rows, session wasn't created

### Step 3: Check Browser Cookies

In browser console:

```javascript
document.cookie; // Shows all cookies
```

You should see:

- `connect.sid` cookie
- Should not be expired
- Should not be marked Secure if on localhost

### Step 4: Verify Database Session Table

```sql
-- Is the session table even being used?
SELECT COUNT(*) FROM session;

-- Is it growing?
SELECT COUNT(*) FROM session WHERE expire > NOW();

-- Check for old expired sessions
SELECT COUNT(*) FROM session WHERE expire < NOW();
```

If session table is empty:

- Sessions aren't being saved
- Check database connection
- Check if session middleware is configured correctly

---

## SCENARIO 4: High Email Failure Rate

### Step 1: Check Overall Email Stats

```sql
SELECT
  email_type,
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM email_delivery_logs WHERE created_at > NOW() - INTERVAL '1 hour'), 2) as percentage
FROM email_delivery_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY email_type, status
ORDER BY percentage DESC;
```

**Healthy system:**

- > 95% success rate
- < 5% failures
- No pending emails older than 10 minutes

### Step 2: Check Error Messages

```sql
SELECT
  error_message,
  COUNT(*) as count
FROM email_delivery_logs
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY error_message
ORDER BY count DESC;
```

**Common errors and fixes:**

**"RESEND_API_KEY not configured"**

- Railway environment variable not set
- Fix: Add RESEND_API_KEY to Railway

**"Invalid email format"**

- Users entering bad emails
- Not a system problem

**"Invalid request body"**

- Email template has invalid HTML
- Check HTML in error response

**"No reply email address"**

- EMAIL_FROM environment variable not set
- Fix: Set EMAIL_FROM to valid email

### Step 3: Check Resend Service Status

1. Go to https://status.resend.com
2. Check if service is operational
3. If down, emails will fail automatically retry

### Step 4: Check Email Retry System

```sql
SELECT COUNT(*) as pending_retries
FROM email_delivery_logs
WHERE status = 'failed'
AND attempt_count < 3
AND last_attempted_at < NOW() - INTERVAL '5 minutes';
```

- If > 0, system will retry these automatically
- Retries happen every 5 minutes
- Check same query again after 5 min to see if count decreased

---

## SCENARIO 5: User Account Doesn't Exist But Should

### Step 1: Check Users Table

```sql
SELECT id, email, created_at, subscription_status
FROM users
WHERE LOWER(email) = 'user@example.com'
LIMIT 1;
```

**If no row:**

- User account was never created
- Stripe webhook might have failed
- Solution: Create user manually (see below)

**If row exists:**

- User account exists
- Problem might be elsewhere

### Step 2: Check Signup Process Logs

Look at server logs around the time user tried to sign up:

- Search for user's email
- Look for errors during Stripe webhook

### Step 3: Create User Manually

If user account is missing, create it:

```sql
INSERT INTO users (email, subscription_status, created_at)
VALUES ('user@example.com', 'free_tier', NOW())
RETURNING id, email, created_at;
```

Then:

1. Resend magic link to user
2. They should be able to log in now

---

## SCENARIO 6: System-Wide Issues

### Quick Health Check

```sql
-- 1. Are users being created?
SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '1 hour';

-- 2. Are magic links being generated?
SELECT COUNT(*) FROM magic_links WHERE created_at > NOW() - INTERVAL '1 hour';

-- 3. Are emails being delivered?
SELECT COUNT(*) FROM email_delivery_logs WHERE status = 'sent' AND created_at > NOW() - INTERVAL '1 hour';

-- 4. Are logins succeeding?
SELECT COUNT(*) FROM login_audit_log WHERE action = 'login_successful' AND created_at > NOW() - INTERVAL '1 hour';

-- 5. Any failed logins?
SELECT COUNT(*) FROM login_audit_log WHERE success = false AND created_at > NOW() - INTERVAL '1 hour';
```

### If All Counts Are Zero

- System might be down
- Or nobody is using it!
- Check server is actually running: `ps aux | grep node`
- Check server logs: `tail -f /var/log/app.log`

### If Email Counts Are Zero But Users Are High

- Email service is completely broken
- Check RESEND_API_KEY exists
- Check Resend.com status
- Restart server

### If Logins Are Failing

- Check login_audit_log for error_messages
- Likely token validation or session issue
- Review previous scenarios

---

## ADMIN API ENDPOINTS

### Get Email Delivery Status for a User

```bash
curl -X GET "http://localhost:8080/api/admin/email-status/user@example.com" \
  -H "Cookie: connect.sid=[your-session-id]"
```

### Get User's Login History

```bash
curl -X GET "http://localhost:8080/api/admin/user-login-history/user@example.com" \
  -H "Cookie: connect.sid=[your-session-id]"
```

### Manually Resend Magic Link

```bash
curl -X POST "http://localhost:8080/api/admin/resend-magic-link" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=[your-session-id]" \
  -d '{"email": "user@example.com"}'
```

### Manual User Account Creation

If a user's account doesn't exist, create it:

```sql
INSERT INTO users (email, subscription_status, created_at)
VALUES ('user@example.com', 'free_tier', NOW())
RETURNING id;
```

---

## COMMON QUERIES

### Find All Failed Login Attempts in Last Hour

```sql
SELECT email, action, error_message, ip_address, created_at
FROM login_audit_log
WHERE success = false
AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Find All Expired Unused Tokens

```sql
SELECT email, token, expires_at, created_at
FROM magic_links
WHERE used = false
AND expires_at < NOW()
LIMIT 50;
```

### Find Tokens That Were Used

```sql
SELECT email, created_at, used_at, EXTRACT(EPOCH FROM (used_at - created_at)) as seconds_to_use
FROM magic_links
WHERE used = true
ORDER BY used_at DESC
LIMIT 50;
```

### Find Emails That Failed to Send

```sql
SELECT email_address, email_type, status, error_message, attempt_count, created_at
FROM email_delivery_logs
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

---

## WHEN TO ESCALATE

If you've tried everything above and still can't figure it out, check:

1. **Server Logs** - Look for Python/Node errors
2. **Sentry Dashboard** - Check error monitoring
3. **Railway Dashboard** - Check for deployment issues
4. **Database Status** - Can you connect to PostgreSQL?
5. **Email Service Status** - Is Resend operational?

Then you have enough info to debug or ask for help.

---

## PREVENTION: Monitoring Checklist

**Daily:**

- [ ] Check email success rate > 95%
- [ ] Check no failed emails older than 1 hour
- [ ] Check login success rate > 99%

**Weekly:**

- [ ] Review error messages in email_delivery_logs
- [ ] Check user signup → login completion rate
- [ ] Test magic link flow end-to-end yourself

**Monthly:**

- [ ] Review all error_messages to find patterns
- [ ] Check database size (should be stable)
- [ ] Test manual email resend functionality
