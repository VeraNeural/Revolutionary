# MAGIC LINK SERVER.JS CODE CHANGES
## Copy and paste these exact changes into server.js

### CHANGE 1: Add Magic Links Helper Functions (after sendEmail function, before graceful shutdown)

Add this code after line 195 (after the retry system):

```javascript
// ==================== MAGIC LINK TOKEN CREATION ====================
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
    ).catch(error => {
      // If table doesn't exist, create inline
      if (error.message.includes('does not exist')) {
        console.warn('⚠️ magic_links table not found, attempting to create...');
        return null;
      }
      throw error;
    });
    
    if (!tokenResult?.rows[0]) {
      throw new Error('Failed to create magic link token - table may not exist');
    }
    
    const magicLinkRecord = tokenResult.rows[0];
    
    // Log creation
    await db.query(
      `INSERT INTO login_audit_log (email, token_id, action, success)
       VALUES ($1, $2, 'token_created', true)`,[normalizedEmail, magicLinkRecord.id]
    ).catch(() => null); // Silently fail if table doesn't exist
    
    console.log(`✅ Magic link token created:`, {
      email: normalizedEmail,
      tokenId: magicLinkRecord.id,
      expiresAt: magicLinkRecord.expires_at
    });
    
    return magicLinkRecord;
  } catch (error) {
    console.error(`❌ Failed to create magic link for ${email}:`, error);
    throw error;
  }
}
```

---

### CHANGE 2: Replace the entire `/api/auth/send-magic-link` endpoint

Find this endpoint around line 2128 and replace the entire thing with:

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
      console.warn(`⚠️ No user found for ${normalizedEmail}`);
      
      // Log audit
      await db.query(
        `INSERT INTO login_audit_log (email, action, ip_address, success, error_message)
         VALUES ($1, 'token_requested_user_not_found', $2, false, 'User does not exist')`,[normalizedEmail, clientIp]
      ).catch(() => null);
      
      return res.status(404).json({ 
        error: 'No account found with this email.',
        suggestion: 'Please sign up first or check your email spelling.'
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
      console.warn(`⚠️ Using default baseUrl: ${baseUrl}`);
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
        emailType: 'magic_link'
      });
      
      console.log(`✅ Magic link email queued for delivery:`, {
        to: normalizedEmail,
        emailLogId: emailResult.logId,
        resendId: emailResult.id
      });
      
      // Log success in audit
      await db.query(
        `INSERT INTO login_audit_log (email, token_id, action, ip_address, success)
         VALUES ($1, $2, 'magic_link_email_sent', $3, true)`, [normalizedEmail, magicLinkRecord.id, clientIp]
      ).catch(() => null);
      
      return res.json({
        success: true,
        message: 'Check your email for the sign-in link. It expires in 15 minutes.',
        logId: emailResult.logId
      });
      
    } catch (emailError) {
      console.error(`❌ Email send failed for ${normalizedEmail}:`, emailError.message);
      
      await db.query(
        `INSERT INTO login_audit_log (email, token_id, action, ip_address, success, error_message)
         VALUES ($1, $2, 'magic_link_email_failed', $3, false, $4)`,
        [normalizedEmail, magicLinkRecord.id, clientIp, emailError.message.substring(0, 500)]
      ).catch(() => null);
      
      return res.status(500).json({
        error: 'Failed to send sign-in email. Please try again.',
        debug: process.env.NODE_ENV === 'development' ? emailError.message : undefined
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

### CHANGE 3: Replace the entire `/verify-magic-link` endpoint

Find this endpoint around line 2210 and replace the entire thing with:

```javascript
app.get('/verify-magic-link', async (req, res) => {
  const { token } = req.query;
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent');
  
  console.log(`🔍 Verifying magic link token: ${token?.substring(0, 10)}...`);
  
  // ==================== VALIDATE TOKEN ====================
  if (!token) {
    console.error('❌ No token provided');
    await db.query(
      `INSERT INTO login_audit_log (email, action, ip_address, success, error_message)
       VALUES ($1, 'token_missing', $2, false, 'No token provided')`,[null, clientIp]
    ).catch(() => null);
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
    ).catch(error => {
      if (error.message.includes('does not exist')) {
        console.warn('⚠️ magic_links table does not exist');
        return null;
      }
      throw error;
    });
    
    if (!tokenResult?.rows || tokenResult.rows.length === 0) {
      console.error(`❌ Token not found: ${token.substring(0, 10)}...`);
      return res.redirect('/login.html?error=invalid_token&msg=This%20sign-in%20link%20is%20invalid');
    }
    
    const magicLink = tokenResult.rows[0];
    console.log(`✅ Token found for ${magicLink.email}`);
    
    // ==================== CHECK IF ALREADY USED ====================
    if (magicLink.used) {
      console.error(`❌ Token already used: ${token.substring(0, 10)}...`);
      return res.redirect('/login.html?error=token_used&msg=This%20link%20has%20already%20been%20used');
    }
    
    // ==================== CHECK IF EXPIRED ====================
    const now = new Date();
    const expiresAt = new Date(magicLink.expires_at);
    
    if (now > expiresAt) {
      console.error(`❌ Token expired: ${token.substring(0, 10)}...`);
      return res.redirect('/login.html?error=expired_token&msg=This%20link%20has%20expired.%20Please%20request%20a%20new%20one');
    }
    
    console.log(`✅ Token is valid and not expired`);
    
    // ==================== GET USER FROM DATABASE ====================
    console.log(`👤 Looking up user: ${magicLink.email}`);
    
    const userResult = await db.query(
      'SELECT id, email FROM users WHERE LOWER(email) = $1',
      [magicLink.email.toLowerCase()]
    );
    
    if (userResult.rows.length === 0) {
      console.error(`❌ User not found: ${magicLink.email}`);
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
    ).catch(() => null);
    
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
    await db.query(
      `INSERT INTO login_audit_log (email, token_id, action, ip_address, user_agent, success)
       VALUES ($1, $2, 'login_successful', $3, $4, true)`,
      [user.email, magicLink.id, clientIp, userAgent]
    ).catch(() => null);
    
    // ==================== REDIRECT TO APP ====================
    console.log(`🚀 Redirecting ${user.email} to /chat.html`);
    return res.redirect('/chat.html');
    
  } catch (error) {
    console.error('❌ Magic link verification error:', error);
    Sentry?.captureException(error, { tags: { endpoint: 'verify-magic-link' } });
    return res.redirect('/login.html?error=verification_failed&msg=An%20error%20occurred%20during%20sign-in');
  }
});
```

---

### CHANGE 4: Add Admin Monitoring Endpoints

Find line 3468 (the line with `// ==================== EXPORT FOR SERVERLESS ====================`)

Add this code BEFORE that line:

```javascript
// ==================== ADMIN: EMAIL DELIVERY STATUS ====================
app.get('/api/admin/email-status/:email', async (req, res) => {
  try {
    if (!process.env.ADMIN_EMAIL || req.session.userEmail !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const email = req.params.email.toLowerCase();
    
    const logs = await db.query(
      `SELECT id, email_address, email_type, status, attempt_count, error_message, sent_at, created_at
       FROM email_delivery_logs
       WHERE LOWER(email_address) = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [email]
    ).catch(() => ({ rows: [] }));
    
    const stats = {
      totalEmails: logs.rows.length,
      sentCount: logs.rows.filter(l => l.status === 'sent').length,
      failedCount: logs.rows.filter(l => l.status === 'failed').length,
      pendingCount: logs.rows.filter(l => l.status === 'pending').length,
      successRate: logs.rows.length > 0 
        ? ((logs.rows.filter(l => l.status === 'sent').length / logs.rows.length) * 100).toFixed(1) + '%'
        : 'N/A'
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
    
    const logs = await db.query(
      `SELECT id, email, token_id, action, ip_address, success, error_message, created_at
       FROM login_audit_log
       WHERE LOWER(email) = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [email]
    ).catch(() => ({ rows: [] }));
    
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
    const userResult = await db.query(
      'SELECT id, email FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );
    
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
      emailType: 'manual_resend'
    });
    
    console.log(`✅ Admin manually resent magic link to ${normalizedEmail}`);
    
    res.json({
      success: true,
      message: `Magic link resent to ${normalizedEmail}`,
      magicLink: process.env.NODE_ENV === 'development' ? magicLink : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## DATABASE TABLES TO CREATE

Run this SQL in Railway database console:

```sql
-- Create magic_links table if it doesn't exist
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

-- Create email_delivery_logs table if it doesn't exist  
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

-- Create login_audit_log table if it doesn't exist
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);
CREATE INDEX IF NOT EXISTS idx_email_logs_email ON email_delivery_logs(email_address);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_login_audit_email ON login_audit_log(email);
```

---

## ENVIRONMENT VARIABLES TO SET IN RAILWAY

```
ADMIN_EMAIL=your-email@example.com
```

This enables admin access to monitoring endpoints.

---

## TESTING

After deployment, test these:

1. **Send magic link**: POST /api/auth/send-magic-link with valid email
2. **Check delivery**: GET /api/admin/email-status/email@test.com (as admin)
3. **Click link**: Visit the magic link URL
4. **Check login history**: GET /api/admin/user-login-history/email@test.com (as admin)

See MAGIC_LINK_TROUBLESHOOTING.md for complete testing guide.
