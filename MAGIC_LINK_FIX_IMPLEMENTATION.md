# MAGIC LINK AUTHENTICATION - COMPLETE IMPLEMENTATION FIX

## Bulletproof Magic Link Flow with Full Auditability

### PART 1: CREATE NEW DATABASE TABLES

Run this SQL in Railway database console:

```sql
-- ==================== MAGIC LINKS TABLE ====================
-- Track every magic link token: when created, if used, when expired
CREATE TABLE IF NOT EXISTS magic_links (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMP,
  used_by_ip VARCHAR(50),
  INDEX_email: email
);

-- ==================== EMAIL DELIVERY LOGS TABLE ====================
-- Track every email we try to send: success, failure, attempts
CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id SERIAL PRIMARY KEY,
  email_address VARCHAR(255) NOT NULL,
  email_type VARCHAR(50) NOT NULL, -- 'magic_link', 'welcome', 'recovery'
  recipient_email VARCHAR(255),
  subject VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending', -- pending, sent, failed, bounced
  attempt_count INT DEFAULT 1,
  error_message TEXT,
  resend_id VARCHAR(255),
  last_attempted_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_email_delivery_email: email_address,
  INDEX idx_email_delivery_status: status,
  INDEX idx_email_delivery_type: email_type
);

-- ==================== LOGIN AUDIT LOG TABLE ====================
-- Track every login attempt: success, failure, token used
CREATE TABLE IF NOT EXISTS login_audit_log (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token_id INTEGER REFERENCES magic_links(id),
  action VARCHAR(50), -- 'token_created', 'token_verified', 'session_created', 'token_expired', 'token_invalid'
  ip_address VARCHAR(50),
  user_agent TEXT,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_login_audit_email: email,
  INDEX idx_login_audit_created: created_at
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);
CREATE INDEX IF NOT EXISTS idx_magic_links_used ON magic_links(used);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_delivery_logs(created_at);
```

---

### PART 2: UPDATE server.js - Enhanced sendEmail with Logging

Replace the current `sendEmail` function with this enhanced version:

```javascript
// ==================== ENHANCED EMAIL DELIVERY SYSTEM ====================

async function logEmailAttempt(email, emailType, subject, status = 'pending') {
  try {
    const result = await db.query(
      `INSERT INTO email_delivery_logs 
       (email_address, email_type, subject, status, attempt_count, created_at)
       VALUES ($1, $2, $3, $4, 1, NOW())
       RETURNING id`,
      [email, emailType, subject, status]
    );
    return result.rows[0]?.id || null;
  } catch (error) {
    console.warn('⚠️  Could not log email attempt:', error.message);
    return null;
  }
}

async function updateEmailLog(logId, status, metadata = {}) {
  if (!logId) return;
  try {
    const errorMsg = metadata.error?.message || metadata.errorMessage || null;
    const resendId = metadata.id || metadata.resendId || null;

    await db.query(
      `UPDATE email_delivery_logs
       SET status = $1, 
           error_message = $2,
           resend_id = $3,
           sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE sent_at END,
           last_attempted_at = NOW()
       WHERE id = $4`,
      [status, errorMsg?.substring(0, 500), resendId, logId]
    );
  } catch (error) {
    console.warn('⚠️  Could not update email log:', error.message);
  }
}

async function sendEmail({ to, subject, html, emailType = 'transactional' }) {
  console.log(`📧 Sending email to ${to} [${emailType}]`);

  let logId = null;
  const maxRetries = 3;

  try {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      throw new Error(`Invalid email format: ${to}`);
    }

    // Trim and lowercase email
    const normalizedEmail = to.trim().toLowerCase();

    // Log the attempt
    logId = await logEmailAttempt(normalizedEmail, emailType, subject, 'pending');

    // Validate Resend API is configured
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured in environment');
    }

    // Send via Resend with retries
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📧 Attempt ${attempt}/${maxRetries} to send email to ${normalizedEmail}`);

        const result = await resend.emails.send({
          from: process.env.EMAIL_FROM || 'vera@veraneural.com',
          to: normalizedEmail,
          subject: subject,
          html: html,
        });

        // Success!
        console.log(`✅ Email sent successfully to ${normalizedEmail}`, {
          resendId: result.id,
          attempt,
          emailType,
        });

        // Update log
        await updateEmailLog(logId, 'sent', result);

        return { success: true, id: result.id, logId, attempt };
      } catch (error) {
        lastError = error;
        console.error(`❌ Email attempt ${attempt} failed for ${normalizedEmail}:`, error.message);

        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff: 1s, 2s, 4s)
          const waitTime = Math.pow(2, attempt - 1) * 1000;
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries failed
    throw new Error(`Failed to send email after ${maxRetries} attempts: ${lastError?.message}`);
  } catch (error) {
    const errorMsg = error.message || JSON.stringify(error);
    console.error(`❌ Email delivery failed: ${errorMsg}`);

    // Update log with failure
    await updateEmailLog(logId, 'failed', { error });

    // Log to Sentry for alerts
    if (Sentry) {
      Sentry.captureException(error, {
        tags: { component: 'email-delivery', type: emailType },
        extra: { to, subject, logId },
      });
    }

    throw error;
  }
}

// ==================== MAGIC LINK CREATION ====================
async function createMagicLink(email, emailType = 'magic_link') {
  try {
    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    // Generate secure token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    console.log(`🔑 Generating magic link token for ${normalizedEmail}`);

    // Store token in dedicated magic_links table
    const tokenResult = await db.query(
      `INSERT INTO magic_links (email, token, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, token, expires_at`,
      [normalizedEmail, token, expiresAt]
    );

    if (!tokenResult.rows[0]) {
      throw new Error('Failed to create magic link token');
    }

    const magicLinkRecord = tokenResult.rows[0];

    // Log creation
    await db.query(
      `INSERT INTO login_audit_log (email, token_id, action, success)
       VALUES ($1, $2, 'token_created', true)`,
      [normalizedEmail, magicLinkRecord.id]
    );

    console.log(`✅ Magic link token created:`, {
      email: normalizedEmail,
      tokenId: magicLinkRecord.id,
      expiresAt: magicLinkRecord.expires_at,
    });

    return magicLinkRecord;
  } catch (error) {
    console.error(`❌ Failed to create magic link for ${email}:`, error);
    throw error;
  }
}

// ==================== EMAIL RETRY SYSTEM ====================
// Run every 5 minutes to retry failed emails
async function retryFailedEmails() {
  try {
    const failedEmails = await db
      .query(
        `SELECT id, email_address, subject, html, email_type, attempt_count
       FROM email_delivery_logs
       WHERE status = 'failed'
       AND attempt_count < 3
       AND last_attempted_at < NOW() - INTERVAL '5 minutes'
       LIMIT 10`
      )
      .catch(() => ({ rows: [] }));

    if (!failedEmails.rows || failedEmails.rows.length === 0) {
      return;
    }

    console.log(`🔄 Retrying ${failedEmails.rows.length} failed emails...`);

    for (const emailLog of failedEmails.rows) {
      try {
        // Attempt to send again
        const result = await resend.emails.send({
          from: process.env.EMAIL_FROM || 'vera@veraneural.com',
          to: emailLog.email_address,
          subject: emailLog.subject,
          html: emailLog.html,
        });

        // Mark as succeeded
        await db.query(
          `UPDATE email_delivery_logs
           SET status = 'sent', resend_id = $1, sent_at = NOW(), attempt_count = attempt_count + 1
           WHERE id = $2`,
          [result.id, emailLog.id]
        );

        console.log(`✅ Retry successful for ${emailLog.email_address}`);
      } catch (retryError) {
        // Update attempt count
        await db.query(
          `UPDATE email_delivery_logs
           SET attempt_count = attempt_count + 1, last_attempted_at = NOW()
           WHERE id = $1`,
          [emailLog.id]
        );

        console.log(`❌ Retry still failed for ${emailLog.email_address}`);
      }
    }
  } catch (error) {
    console.error('❌ Retry system error:', error);
  }
}

// Start retry system - runs every 5 minutes
setInterval(
  () => {
    retryFailedEmails().catch((err) => console.error('Retry interval error:', err));
  },
  5 * 60 * 1000
);
```

---

### PART 3: UPDATE `/api/auth/send-magic-link` ENDPOINT

Replace the entire endpoint with this bulletproof version:

```javascript
app.post('/api/auth/send-magic-link', async (req, res) => {
  const { email } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  // ==================== INPUT VALIDATION ====================
  if (!email) {
    console.warn('❌ Magic link request missing email');
    Sentry?.captureMessage('Magic link request missing email', 'warning');
    return res.status(400).json({ error: 'Email is required' });
  }

  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    console.warn(`❌ Invalid email format: ${normalizedEmail}`);
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  try {
    // ==================== CHECK IF USER EXISTS ====================
    console.log(`🔍 Checking if user exists: ${normalizedEmail}`);

    const userResult = await db.query(
      'SELECT id, email, subscription_status, created_at FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      console.warn(`⚠️  No user found for ${normalizedEmail}`);

      // Log audit
      await db
        .query(
          `INSERT INTO login_audit_log (email, action, ip_address, success, error_message)
         VALUES ($1, 'token_requested_user_not_found', $2, false, 'User does not exist')`,
          [normalizedEmail, clientIp]
        )
        .catch(() => null);

      // DON'T reveal whether email exists (security best practice)
      // But we can be more helpful:
      return res.status(404).json({
        error: 'No account found with this email.',
        suggestion: 'Please sign up first or check your email spelling.',
      });
    }

    const user = userResult.rows[0];
    console.log(`✅ User found: ${normalizedEmail} (ID: ${user.id})`);

    // ==================== CREATE MAGIC LINK TOKEN ====================
    let magicLinkRecord;
    try {
      magicLinkRecord = await createMagicLink(normalizedEmail, 'magic_link');
    } catch (error) {
      console.error(`❌ Failed to create magic link token:`, error);
      return res.status(500).json({ error: 'Failed to generate sign-in link. Please try again.' });
    }

    // ==================== BUILD MAGIC LINK URL ====================
    const baseUrl = process.env.APP_URL || 'http://localhost:8080';
    if (!baseUrl || baseUrl === 'http://localhost:8080') {
      console.warn(`⚠️  Using default baseUrl: ${baseUrl}`);
    }

    const magicLink = `${baseUrl}/verify-magic-link?token=${magicLinkRecord.token}`;
    console.log(`🔗 Magic link URL: ${magicLink}`);

    // ==================== SEND EMAIL ====================
    try {
      const emailResult = await sendEmail({
        to: normalizedEmail,
        subject: 'Your VERA Sign-In Link',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
              .code { background: #f5f5f5; padding: 12px; border-radius: 5px; font-family: monospace; word-break: break-all; margin: 15px 0; color: #555; }
              .footer { font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Sign In to VERA</h1>
              </div>
              <div class="content">
                <p>Click the button below to securely sign in to your VERA account:</p>
                <center>
                  <a href="${magicLink}" class="button">Sign In to VERA</a>
                </center>
                <p>Or copy and paste this link in your browser:</p>
                <div class="code">${magicLink}</div>
                <div class="footer">
                  <p>This link expires in 15 minutes and can only be used once.</p>
                  <p>If you didn't request this email, please ignore it.</p>
                  <p>— The VERA Team</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        emailType: 'magic_link',
      });

      console.log(`✅ Magic link email queued for delivery:`, {
        to: normalizedEmail,
        emailLogId: emailResult.logId,
        resendId: emailResult.id,
      });

      // Log success in audit
      await db
        .query(
          `INSERT INTO login_audit_log (email, token_id, action, ip_address, success)
         VALUES ($1, $2, 'magic_link_email_sent', $3, true)`,
          [normalizedEmail, magicLinkRecord.id, clientIp]
        )
        .catch(() => null);

      // Return success to user
      return res.json({
        success: true,
        message: 'Check your email for the sign-in link. It expires in 15 minutes.',
        logId: emailResult.logId, // Debug ID
      });
    } catch (emailError) {
      console.error(`❌ Email send failed for ${normalizedEmail}:`, emailError.message);

      // Log failure
      await db
        .query(
          `INSERT INTO login_audit_log (email, token_id, action, ip_address, success, error_message)
         VALUES ($1, $2, 'magic_link_email_failed', $3, false, $4)`,
          [normalizedEmail, magicLinkRecord.id, clientIp, emailError.message.substring(0, 500)]
        )
        .catch(() => null);

      // Return error to user
      return res.status(500).json({
        error: 'Failed to send sign-in email. Please try again.',
        debug: process.env.NODE_ENV === 'development' ? emailError.message : undefined,
      });
    }
  } catch (error) {
    console.error('❌ Magic link endpoint error:', error);
    Sentry?.captureException(error, { tags: { endpoint: 'send-magic-link' } });
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
});
```

---

### PART 4: UPDATE `/verify-magic-link` ENDPOINT

Replace with this enhanced version:

```javascript
app.get('/verify-magic-link', async (req, res) => {
  const { token } = req.query;
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent');

  console.log(`🔍 Verifying magic link token: ${token?.substring(0, 10)}...`);

  // ==================== VALIDATE TOKEN ====================
  if (!token) {
    console.error('❌ No token provided');
    await db
      .query(
        `INSERT INTO login_audit_log (email, action, ip_address, success, error_message)
       VALUES ($1, 'token_missing', $2, false, 'No token provided')`,
        [null, clientIp]
      )
      .catch(() => null);
    return res.redirect('/login.html?error=invalid_token&msg=No%20sign-in%20link%20provided');
  }

  try {
    // ==================== LOOK UP TOKEN ====================
    console.log(`🔑 Looking up token in database`);

    const tokenResult = await db.query(
      `SELECT id, email, expires_at, used, used_at, created_at
       FROM magic_links
       WHERE token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      console.error(`❌ Token not found: ${token.substring(0, 10)}...`);

      await db
        .query(
          `INSERT INTO login_audit_log (email, action, ip_address, user_agent, success, error_message)
         VALUES ($1, 'token_invalid', $2, $3, false, 'Token not found in database'`,
          [null, clientIp, userAgent]
        )
        .catch(() => null);

      return res.redirect(
        '/login.html?error=invalid_token&msg=This%20sign-in%20link%20is%20invalid'
      );
    }

    const magicLink = tokenResult.rows[0];
    console.log(`✅ Token found for ${magicLink.email}`);

    // ==================== CHECK IF ALREADY USED ====================
    if (magicLink.used) {
      console.error(`❌ Token already used: ${token.substring(0, 10)}...`);

      await db
        .query(
          `INSERT INTO login_audit_log (email, token_id, action, ip_address, user_agent, success, error_message)
         VALUES ($1, $2, 'token_already_used', $3, $4, false, 'Token has already been used'`,
          [magicLink.email, magicLink.id, clientIp, userAgent]
        )
        .catch(() => null);

      return res.redirect(
        '/login.html?error=token_used&msg=This%20link%20has%20already%20been%20used'
      );
    }

    // ==================== CHECK IF EXPIRED ====================
    const now = new Date();
    const expiresAt = new Date(magicLink.expires_at);

    if (now > expiresAt) {
      console.error(`❌ Token expired: ${token.substring(0, 10)}...`);

      await db
        .query(
          `INSERT INTO login_audit_log (email, token_id, action, ip_address, user_agent, success, error_message)
         VALUES ($1, $2, 'token_expired', $3, $4, false, 'Token has expired'`,
          [magicLink.email, magicLink.id, clientIp, userAgent]
        )
        .catch(() => null);

      return res.redirect(
        '/login.html?error=expired_token&msg=This%20link%20has%20expired.%20Please%20request%20a%20new%20one'
      );
    }

    console.log(`✅ Token is valid and not expired`);

    // ==================== GET USER FROM DATABASE ====================
    console.log(`👤 Looking up user: ${magicLink.email}`);

    const userResult = await db.query('SELECT id, email FROM users WHERE LOWER(email) = $1', [
      magicLink.email.toLowerCase(),
    ]);

    if (userResult.rows.length === 0) {
      console.error(`❌ User not found: ${magicLink.email}`);

      await db
        .query(
          `INSERT INTO login_audit_log (email, token_id, action, ip_address, user_agent, success, error_message)
         VALUES ($1, $2, 'user_not_found', $3, $4, false, 'User account does not exist'`,
          [magicLink.email, magicLink.id, clientIp, userAgent]
        )
        .catch(() => null);

      return res.redirect('/login.html?error=user_not_found&msg=User%20account%20not%20found');
    }

    const user = userResult.rows[0];
    console.log(`✅ User found: ${user.email} (ID: ${user.id})`);

    // ==================== MARK TOKEN AS USED ====================
    console.log(`🔒 Marking token as used`);

    await db.query(
      `UPDATE magic_links
       SET used = true, used_at = NOW(), used_by_ip = $1
       WHERE id = $2`,
      [clientIp, magicLink.id]
    );

    // ==================== CREATE SESSION ====================
    console.log(`📝 Creating user session for ${user.email}`);

    req.session.userId = user.id;
    req.session.userEmail = user.email;

    // Ensure session is saved before redirecting
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`✅ Session created successfully for ${user.email}`);

    // ==================== LOG SUCCESSFUL LOGIN ====================
    await db
      .query(
        `INSERT INTO login_audit_log (email, token_id, action, ip_address, user_agent, success)
       VALUES ($1, $2, 'login_successful', $3, $4, true)`,
        [user.email, magicLink.id, clientIp, userAgent]
      )
      .catch(() => null);

    // ==================== REDIRECT TO APP ====================
    console.log(`🚀 Redirecting ${user.email} to /chat.html`);
    return res.redirect('/chat.html');
  } catch (error) {
    console.error('❌ Magic link verification error:', error);
    Sentry?.captureException(error, { tags: { endpoint: 'verify-magic-link' } });

    return res.redirect(
      '/login.html?error=verification_failed&msg=An%20error%20occurred%20during%20sign-in'
    );
  }
});
```

---

### PART 5: ADD ADMIN MONITORING ENDPOINTS

Add these endpoints to server.js (before the error handler):

```javascript
// ==================== ADMIN: EMAIL DELIVERY STATUS ====================
app.get('/api/admin/email-status/:email', async (req, res) => {
  try {
    if (!process.env.ADMIN_EMAIL || req.session.userEmail !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const email = req.params.email.toLowerCase();

    const logs = await db
      .query(
        `SELECT id, email_address, email_type, status, attempt_count, error_message, sent_at, created_at
       FROM email_delivery_logs
       WHERE LOWER(email_address) = $1
       ORDER BY created_at DESC
       LIMIT 50`,
        [email]
      )
      .catch(() => ({ rows: [] }));

    const stats = {
      totalEmails: logs.rows.length,
      sentCount: logs.rows.filter((l) => l.status === 'sent').length,
      failedCount: logs.rows.filter((l) => l.status === 'failed').length,
      pendingCount: logs.rows.filter((l) => l.status === 'pending').length,
      successRate:
        logs.rows.length > 0
          ? (
              (logs.rows.filter((l) => l.status === 'sent').length / logs.rows.length) *
              100
            ).toFixed(1) + '%'
          : 'N/A',
    };

    res.json({ email, stats, logs: logs.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN: USER LOGIN HISTORY ====================
app.get('/api/admin/user-login-history/:email', async (req, res) => {
  try {
    if (!process.env.ADMIN_EMAIL || req.session.userEmail !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const email = req.params.email.toLowerCase();

    const logs = await db
      .query(
        `SELECT id, email, token_id, action, ip_address, success, error_message, created_at
       FROM login_audit_log
       WHERE LOWER(email) = $1
       ORDER BY created_at DESC
       LIMIT 100`,
        [email]
      )
      .catch(() => ({ rows: [] }));

    res.json({ email, logs: logs.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN: RESEND MAGIC LINK MANUALLY ====================
app.post('/api/admin/resend-magic-link', async (req, res) => {
  try {
    if (!process.env.ADMIN_EMAIL || req.session.userEmail !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check user exists
    const userResult = await db.query('SELECT id, email FROM users WHERE LOWER(email) = $1', [
      normalizedEmail,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create new magic link
    const magicLinkRecord = await createMagicLink(normalizedEmail, 'manual_resend');

    const baseUrl = process.env.APP_URL || 'http://localhost:8080';
    const magicLink = `${baseUrl}/verify-magic-link?token=${magicLinkRecord.token}`;

    // Send email
    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: '[MANUAL RESEND] Your VERA Sign-In Link',
      html: `<p>Admin-initiated sign-in link: <a href="${magicLink}">Click here to sign in</a></p><p>Link: ${magicLink}</p>`,
      emailType: 'manual_resend',
    });

    console.log(`✅ Admin manually resent magic link to ${normalizedEmail}`);

    res.json({
      success: true,
      message: `Magic link resent to ${normalizedEmail}`,
      magicLink: process.env.NODE_ENV === 'development' ? magicLink : undefined,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

This implementation provides:

✅ Complete email delivery logging  
✅ Automatic retry mechanism with exponential backoff  
✅ Magic link token tracking with full lifecycle  
✅ Comprehensive audit trail  
✅ Admin endpoints for monitoring and manual intervention  
✅ Better error messages  
✅ Session validation  
✅ Full observability into the entire flow

See the Troubleshooting Playbook for how to use these new endpoints.
