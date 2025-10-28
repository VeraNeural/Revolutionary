// ==================== VERA REVOLUTIONARY SYSTEM - COMPLETE SERVER ====================
// Backend API for VERA - Your Nervous System Companion
// This handles authentication, AI chat, Stripe payments, and more

// ==================== INITIALIZE SENTRY FIRST (before any other code) ====================
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app: true, request: true }),
  ],
  beforeSend(event, hint) {
    // Don't send development errors to Sentry (optional)
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }
    return event;
  },
});

console.log('✅ Sentry initialized:', process.env.SENTRY_DSN ? 'Connected' : 'Disabled (no DSN)');

// ==================== LOAD ENVIRONMENT FIRST! ====================
require('dotenv').config({ path: '.env.local' });

console.log('✅ Environment variables loaded');
console.log('🔍 DATABASE_PUBLIC_URL exists:', !!process.env.DATABASE_PUBLIC_URL);
console.log('🔍 ANTHROPIC_API_KEY exists:', !!process.env.ANTHROPIC_API_KEY);

// ==================== NOW load modules that need env vars ====================
const logger = require('./lib/logger');
const sessionCleaner = require('./lib/session-cleaner');

logger.info('🚀 VERA server.js starting...', {
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || 'not set',
});

console.log('✅ Environment variables loaded');
console.log('📍 DATABASE_PUBLIC_URL exists:', !!process.env.DATABASE_PUBLIC_URL);
console.log('📍 ANTHROPIC_API_KEY exists:', !!process.env.ANTHROPIC_API_KEY);

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const bcrypt = require('bcrypt');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('./lib/database-manager');
const { getVERAResponse, setVERADebug } = require('./lib/vera-ai');
const { handleDatabaseError } = require('./lib/database-helpers');
const rateLimiter = require('./lib/rate-limiter');
// ==================== AUTOMATION INFRASTRUCTURE ====================
const errorHandler = require('./middleware/error-handler');
const performanceMonitor = require('./middleware/performance');
const envValidator = require('./lib/env-validator');

// Validate environment configuration (AFTER all modules loaded)
try {
  const envValidator = require('./lib/env-validator');
  envValidator.validate();
  logger.info('✅ Environment validation passed');
} catch (error) {
  logger.error('❌ Environment validation failed', { error: error.message });
  console.error('Environment validation failed:', error.message);
  process.exit(1);
}
// ==================== EMAIL SETUP - RESEND ====================
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

console.log('✅ Email configured with Resend');

// ==================== MINIMAL EMAIL SYSTEM - BATTLE TESTED ====================
async function sendEmail({ to, subject, html, emailType = 'transactional' }) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 EMAIL SEND ATTEMPT STARTED');
  console.log('To:', to);
  console.log('From:', process.env.EMAIL_FROM || 'VERA <onboarding@resend.dev>');
  console.log('Subject:', subject);
  console.log('Type:', emailType);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Validate inputs
  if (!to) {
    console.error('❌ ERROR: No recipient email provided');
    throw new Error('Recipient email is required');
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ ERROR: RESEND_API_KEY not found in environment');
    throw new Error('RESEND_API_KEY not configured');
  }

  if (!resend) {
    console.error('❌ ERROR: Resend client not initialized');
    throw new Error('Resend client not initialized');
  }

  try {
    console.log('📤 Calling Resend API...');
    
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'VERA <onboarding@resend.dev>',
      to: to,
      subject: subject,
      html: html
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ EMAIL SENT SUCCESSFULLY');
    console.log('Resend ID:', result.id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return { success: true, id: result.id };
    
  } catch (error) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ EMAIL SEND FAILED');
    console.error('Error Message:', error.message);
    console.error('Error Name:', error.name);
    console.error('Error Code:', error.code);
    console.error('Status Code:', error.statusCode);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    throw error;
  }
}

// ==================== EMAIL RETRY SYSTEM ====================
async function retryFailedEmails() {
  try {
    // Find emails that failed and haven't hit max retries
    const failedEmails = await db.query(
      `SELECT id, email_address, subject, html, email_type, attempt_count 
       FROM email_logs 
       WHERE status = 'failed' 
       AND attempt_count < max_retries 
       AND last_attempted < NOW() - INTERVAL '5 minutes'
       LIMIT 10`
    ).catch(() => ({ rows: [] })); // Silently fail if table doesn't exist

    if (!failedEmails.rows || failedEmails.rows.length === 0) {
      return { retried: 0, message: 'No failed emails to retry' };
    }

    let successCount = 0;
    let stillFailedCount = 0;

    for (const failedEmail of failedEmails.rows) {
      try {
        const result = await resend.emails.send({
          from: process.env.EMAIL_FROM || 'vera@revolutionary-production.up.railway.app',
          to: failedEmail.email_address,
          subject: failedEmail.subject,
          html: failedEmail.html,
        });

        // Update to success
        await db.query(
          `UPDATE email_logs 
           SET status = $1, resend_id = $2, sent_at = NOW(), attempt_count = attempt_count + 1, updated_at = NOW()
           WHERE id = $3`,
          ['sent', result.id, failedEmail.id]
        ).catch(() => null);

        successCount++;
        console.log('✅ Email retry successful:', failedEmail.email_address);
      } catch (retryError) {
        // Update attempt count
        await db.query(
          `UPDATE email_logs 
           SET attempt_count = attempt_count + 1, last_attempted = NOW(), error_message = $1, updated_at = NOW()
           WHERE id = $2`,
          [retryError.message.substring(0, 1000), failedEmail.id]
        ).catch(() => null);

        stillFailedCount++;
        console.log('❌ Email retry still failed:', failedEmail.email_address);
      }
    }

    const result = { retried: failedEmails.rows.length, successful: successCount, failed: stillFailedCount };
    console.log(`📊 Email retry results: ${successCount} succeeded, ${stillFailedCount} still failed`);
    return result;
  } catch (error) {
    console.error('❌ Retry system error:', error.message);
    if (Sentry) {
      Sentry.captureException(error, { tags: { component: 'email-retry' } });
    }
    return { error: error.message };
  }
}

// Run retry system every 5 minutes (only if table exists)
setInterval(() => {
  retryFailedEmails().catch(err => console.error('Retry interval error:', err));
}, 5 * 60 * 1000);

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
       VALUES ($1, $2, 'token_created', true)`,
      [normalizedEmail, magicLinkRecord.id]
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

// ==================== GRACEFUL SHUTDOWN HANDLING ====================
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing gracefully...');
  process.exit(0);
});

// ==================== DATABASE MIGRATIONS ====================
// Run migrations automatically on startup (production only)
async function runDatabaseMigrations() {
  const DATABASE_URL = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;;
  
  // Only run migrations if DATABASE_URL is set (production environment)
  if (!DATABASE_URL) {
    console.log('⏭️  Skipping migrations (DATABASE_URL not set - development mode)');
    return;
  }

  console.log('🔄 Running database migrations...');

  try {
    const { runMigrations } = require('./run-migrations');
    
    // Create a temporary pool for migrations
    const { Pool } = require('pg');
    const pool = new Pool({
     connectionString: DATABASE_URL,
  statement_timeout: 30000,
  ssl: {
    rejectUnauthorized: false
  }
    });

    let successCount = 0;
    let skipCount = 0;

    try {
      const client = await pool.connect();
      const fs = require('fs');
      const path = require('path');
      
      // Read and parse migrations file
      const migrationsFile = path.join(__dirname, 'DATABASE_MIGRATIONS.sql');
      const migrationContent = fs.readFileSync(migrationsFile, 'utf8');
      
      // Split by semicolon (simple but effective)
      const statements = migrationContent
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      console.log(`  📋 Parsed ${statements.length} migration statements`);

      // Execute each statement
      for (const statement of statements) {
        try {
          await client.query(statement);
          successCount++;
        } catch (error) {
          // Silently skip "already exists" errors
          if (error.code === '42P07' || error.code === '42P15' || error.message.includes('already exists')) {
            skipCount++;
          } else {
            // Log actual errors but don't fail startup
            console.warn(`  ⚠️  Migration warning: ${error.message.substring(0, 100)}`);
          }
        }
      }

      client.release();
      console.log(`✅ Migrations complete: ${successCount} executed, ${skipCount} skipped`);
    } catch (error) {
      console.warn(`⚠️  Migration error (non-blocking): ${error.message.substring(0, 100)}`);
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.warn(`⚠️  Could not run migrations: ${error.message.substring(0, 100)}`);
    // Don't fail startup - migrations are optional
  }
}

// Run migrations before starting server
runDatabaseMigrations().catch(err => {
  console.warn(`⚠️  Migration startup error (non-blocking): ${err.message}`);
});

// ==================== APP INITIALIZATION ====================
const app = express();
const PORT = process.env.PORT || 8080;

// ==================== SENTRY MIDDLEWARE (early in middleware chain) ====================
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// ==================== STRIPE WEBHOOK ====================
// CRITICAL: This MUST come BEFORE express.json() middleware for raw body access
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      console.log('✅ Webhook verified:', event.type);
    } catch (err) {
      console.error('❌ Webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const customerEmail = session.customer_email || session.customer_details?.email;
        
        if (!customerEmail) {
          console.error('❌ No email in checkout session');
          return res.json({ received: true });
        }

        const subscriptionId = session.subscription;
        if (!subscriptionId) {
          console.error('❌ No subscription ID');
          return res.json({ received: true });
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [customerEmail]);

        if (existingUser.rows.length > 0) {
          await db.query(
            'UPDATE users SET subscription_status = $1, stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = NOW() WHERE email = $4',
            [subscription.status, session.customer, subscriptionId, customerEmail]
          );
          console.log('✅ Updated user:', customerEmail);
        } else {

          const trialEndsAt = new Date();
trialEndsAt.setDate(trialEndsAt.getDate() + 7);

          await db.query(
  'INSERT INTO users (email, name, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
  [customerEmail, customerEmail.split('@')[0], session.customer, subscriptionId, subscription.status, trialEndsAt]
);
          console.log('✅ Created user:', customerEmail);
        }
      }

      if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object;
        await db.query(
          'UPDATE users SET subscription_status = $1, updated_at = NOW() WHERE stripe_subscription_id = $2',
          [subscription.status, subscription.id]
        );
        console.log('✅ Subscription updated');
      }

      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;
        await db.query(
          'UPDATE users SET subscription_status = $1, updated_at = NOW() WHERE stripe_subscription_id = $2',
          ['cancelled', subscription.id]
        );
        console.log('✅ Subscription cancelled');
      }

      res.json({ received: true });
    } catch (err) {
      console.error('❌ Webhook error:', err);
      res.status(500).json({ error: 'Webhook failed' });
    }
  }
);

// ==================== MIDDLEWARE ====================
// Body parsing middleware must come first
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Performance and logging middleware
app.use(performanceMonitor.middleware());
app.use(logger.expressMiddleware());

// CORS middleware (moved here to be before routes)
const allowedOrigin = process.env.NODE_ENV === 'production' ? process.env.APP_URL || true : true;
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

// ==================== STRIPE ENDPOINTS ====================
// Create Checkout Session for Guest Signup
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { email, firstName, lastName, anonId, returnUrl } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Valid email required',
      });
    }

    console.log('📝 Creating checkout session for:', email);

    // Create or find customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log('✅ Found existing customer:', customer.id);
    } else {
      customer = await stripe.customers.create({
        email: email,
        name: firstName && lastName ? `${firstName} ${lastName}` : email.split('@')[0],
        address: {
          line1: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94102',
          country: 'US',
        },
        metadata: {
          source: 'VERA',
          signup_date: new Date().toISOString(),
          anon_id: anonId || '',
        },
      });
      console.log('✅ Created new customer:', customer.id);
    }

    // Get base URL from environment or request
    const baseUrl =
      process.env.BASE_URL || process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

    // Create checkout session with 7-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: returnUrl
        ? `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`
        : `${baseUrl}/chat.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnUrl || `${baseUrl}/chat.html`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          source: 'VERA',
          user_email: email,
          anon_id: anonId || '',
        },
      },
      metadata: {
        customer_email: email,
        first_name: firstName || '',
        last_name: lastName || '',
        anon_id: anonId || '',
        source: 'VERA',
      },
    });

    console.log('✅ Checkout session created:', session.id);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('❌ Checkout creation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to create checkout session. Please try again.',
    });
  }
});

// Verify subscription status
app.get('/api/subscription-status', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Valid email required',
      });
    }

    // Find customer by email
    const customers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return res.json({
        success: true,
        hasSubscription: false,
        message: 'No subscription found',
      });
    }

    const customer = customers.data[0];

    // Check for active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1,
    });

    const hasActiveSubscription = subscriptions.data.length > 0;

    res.json({
      success: true,
      hasSubscription: hasActiveSubscription,
      subscription: hasActiveSubscription
        ? {
            id: subscriptions.data[0].id,
            status: subscriptions.data[0].status,
            current_period_end: subscriptions.data[0].current_period_end,
            trial_end: subscriptions.data[0].trial_end,
          }
        : null,
    });
  } catch (error) {
    console.error('❌ Subscription check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to check subscription status',
    });
  }
});

// ==================== STRIPE WEBHOOK ENDPOINT ====================
// CRITICAL: This MUST come BEFORE express.json() middleware for raw body access
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('🔔 Webhook received:', event.type);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// ==================== WEBHOOK HANDLER FUNCTIONS ====================

async function handleCheckoutCompleted(session) {
  console.log('💳 Checkout completed for session:', session.id);

  let customerEmail = session.customer_email || session.customer_details?.email || session.metadata?.customer_email;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  // If email not in session, fetch it from the customer object
  if (!customerEmail && session.customer) {
    const customer = await stripe.customers.retrieve(session.customer);
    customerEmail = customer.email;
    console.log('✅ Retrieved email from customer:', customerEmail);
  }

  if (!customerEmail) {
    console.error('❌ No email found in checkout session');
    return;
  }

  // CHECK FOR DUPLICATE - CRITICAL!
  // Check BOTH email AND customer ID to prevent any duplicate accounts
  const existingUser = await db.query(
    'SELECT * FROM users WHERE email = $1 OR stripe_customer_id = $2',
    [customerEmail, customerId]
  );

  if (existingUser.rows.length > 0) {
    const existing = existingUser.rows[0];
    console.log('⚠️ DUPLICATE DETECTED!');
    console.log('   Existing user:', existing.email);
    console.log('   Existing customer ID:', existing.stripe_customer_id);
    console.log('   New attempt - Email:', customerEmail);
    console.log('   New attempt - Customer ID:', customerId);
    console.log('🔄 Cancelling duplicate subscription:', subscriptionId);

    try {
      // Cancel the duplicate subscription
      await stripe.subscriptions.cancel(subscriptionId);
      console.log('✅ Duplicate subscription cancelled');

      // Optionally refund if already charged (only if payment_intent exists)
      const invoices = await stripe.invoices.list({
        subscription: subscriptionId,
        limit: 1,
      });

      if (invoices.data.length > 0 && invoices.data[0].paid && invoices.data[0].payment_intent) {
        await stripe.refunds.create({
          payment_intent: invoices.data[0].payment_intent,
        });
        console.log('✅ Refund issued for duplicate subscription');
      } else {
        console.log('ℹ️ No payment to refund (trial period or unpaid invoice)');
      }
    } catch (error) {
      console.error('❌ Error cancelling duplicate:', error);
    }

    return; // Don't create duplicate account
  }

  // Create new user account
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  try {
    await db.query(
      `INSERT INTO users (email, name, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        customerEmail,
        customerEmail.split('@')[0],
        customerId,
        subscriptionId,
        'active',
        trialEndsAt,
      ]
    );

    console.log('✅ User account created via webhook:', customerEmail);
  } catch (error) {
    console.error('❌ Error creating user:', error);
  }
}

async function handleSubscriptionCreated(subscription) {
  console.log('📝 Subscription created:', subscription.id);

  const customerId = subscription.customer;

  try {
    // Get customer email
    const customer = await stripe.customers.retrieve(customerId);
    const email = customer.email;

    // Update user subscription status
    await db.query(
      'UPDATE users SET subscription_status = $1, stripe_subscription_id = $2 WHERE email = $3',
      ['active', subscription.id, email]
    );

    console.log('✅ Subscription status updated for:', email);
  } catch (error) {
    console.error('❌ Error handling subscription created:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log('🔄 Subscription updated:', subscription.id);

  const status = subscription.status; // active, past_due, canceled, etc.

  try {
    await db.query('UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2', [
      status,
      subscription.id,
    ]);

    console.log('✅ Subscription status updated to:', status);
  } catch (error) {
    console.error('❌ Error handling subscription update:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('❌ Subscription cancelled:', subscription.id);

  try {
    // Mark subscription as cancelled but keep user data
    await db.query('UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2', [
      'cancelled',
      subscription.id,
    ]);

    console.log('✅ User subscription marked as cancelled');
  } catch (error) {
    console.error('❌ Error handling subscription deletion:', error);
  }
}

async function handlePaymentFailed(invoice) {
  console.log('💔 Payment failed for invoice:', invoice.id);

  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  try {
    // Get customer email
    const customer = await stripe.customers.retrieve(customerId);
    const email = customer.email;

    // Update user status to payment_failed
    await db.query('UPDATE users SET subscription_status = $1 WHERE email = $2', [
      'payment_failed',
      email,
    ]);

    console.log('⚠️ User marked as payment failed:', email);

    // TODO: Send email notification about failed payment
  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
  }
}

async function handlePaymentSucceeded(invoice) {
  console.log('✅ Payment succeeded for invoice:', invoice.id);

  const customerId = invoice.customer;

  try {
    // Get customer email
    const customer = await stripe.customers.retrieve(customerId);
    const email = customer.email;

    // Update user status to active
    await db.query('UPDATE users SET subscription_status = $1 WHERE email = $2', ['active', email]);

    console.log('✅ Payment confirmed, user active:', email);
  } catch (error) {
    console.error('❌ Error handling payment success:', error);
  }
}

// Database is already initialized by database-manager module

// ==================== ADDITIONAL MIDDLEWARE ====================
// Prevent stale HTML after deploys: disable caching for HTML documents
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// Session middleware
app.use(
  session({
    store: new pgSession({
      pool: db.getPool(), // Use the pool from our database manager
      tableName: 'session',
    }),
    secret: process.env.SESSION_SECRET || 'vera-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

// Serve static files
app.use(express.static('public'));

// ==================== DATABASE INITIALIZATION ====================
async function initializeDatabase() {
  try {
    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        subscription_status VARCHAR(50) DEFAULT 'inactive',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        trial_starts_at TIMESTAMP,
        trial_ends_at TIMESTAMP,
        onboarding_completed BOOLEAN DEFAULT false,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP
      )
    `);

    // Create conversations table (ensure this exists before messages use it)
    await db.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        last_message_preview TEXT
      )
    `);

    // Create messages table (include conversation_id column)
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        conversation_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // If messages table was already present without conversation_id, add column defensively
    try {
      await db.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id INTEGER');
    } catch (e) {
      // Non-fatal: log and continue; queries will still run but without FK enforcement
      console.warn(
        '⚠️ Could not ensure conversation_id column exists on messages table:',
        e.message
      );
    }

    // Create session table for express-session
    await db.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        PRIMARY KEY (sid)
      )
    `);

    // Create crisis_alerts table for VERA's crisis detection
    await db.query(`
      CREATE TABLE IF NOT EXISTS crisis_alerts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        message_content TEXT NOT NULL,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create leads table for comprehensive lead tracking
    await db.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        company VARCHAR(255),
        phone VARCHAR(50),
        use_case VARCHAR(100),
        lead_source VARCHAR(255),
        referrer TEXT,
        utm_source VARCHAR(255),
        utm_medium VARCHAR(255),
        utm_campaign VARCHAR(255),
        user_agent TEXT,
        timezone VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        converted_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'new'
      )
    `);

    // Ensure users table has an updated_at column (schema may vary between environments)
    try {
      await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
    } catch (e) {
      console.warn('⚠️ Could not ensure users.updated_at column exists:', e.message);
    }

    // Create subscription_history table (payment tracking)
    await db.query(`
      CREATE TABLE IF NOT EXISTS subscription_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        stripe_subscription_id VARCHAR(255),
        event_type VARCHAR(100) NOT NULL,
        status VARCHAR(50),
        amount INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes used by the schema (non-critical but helpful)
    try {
      await db.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription ON users(stripe_subscription_id)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_subscription_history_user ON subscription_history(user_id)');
    } catch (e) {
      console.warn('⚠️ Could not create some indexes:', e.message);
    }

    // Create or replace trigger function to keep updated_at in sync
    try {
      await db.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
      `);

      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at'
          ) THEN
            CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
          END IF;
        END$$;
      `);
    } catch (e) {
      console.warn('⚠️ Could not ensure updated_at trigger exists:', e.message);
    }

    console.log('✅ Database initialized - VERA remembers everything');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

initializeDatabase();

// ==================== DOMAIN-BASED ROUTING ====================
app.get('/', (req, res) => {
  // Serve landing page at root
  res.sendFile(path.join(__dirname, 'landing.html'));
});

// Serve promo experience
app.get('/intro', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'intro.html'));
});

// Serve chat interface
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Serve subscription page
app.get('/subscribe', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'subscribe.html'));
});

// Serve community offer page
app.get('/community', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'community.html'));
});

// Serve professional offer page
app.get('/professional', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'professional.html'));
});

// ==================== HEALTH CHECK & MONITORING ====================
const monitor = require('./lib/monitoring'); // ✅

// Basic health endpoint for quick checks
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    vera: 'revolutionary',
    timestamp: new Date().toISOString(),
  });
});

// Detailed monitoring endpoint with system stats
app.get('/monitoring', async (req, res) => {
  // Basic auth check for monitoring access
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.MONITOR_KEY || 'vera-monitor-key'}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const health = await monitor.checkHealth();
  res.json(health);
});

// ==================== VERSION ENDPOINT ====================
app.get('/version', (req, res) => {
  const version =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    process.env.APP_VERSION ||
    'dev-local';
  res.json({ version, time: new Date().toISOString() });
});

// ==================== STRIPE CONFIG TEST ====================
app.get('/api/stripe-config', (req, res) => {
  res.json({
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    stripeKeyPrefix: process.env.STRIPE_SECRET_KEY
      ? process.env.STRIPE_SECRET_KEY.substring(0, 7)
      : 'missing',
    hasPriceId: !!process.env.STRIPE_PRICE_ID,
    priceId: process.env.STRIPE_PRICE_ID || 'using fallback: price_1SIgAtF8aJ0BDqA3WXVJsuVD',
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    appUrl: process.env.APP_URL || 'not set',
  });
});

// ==================== STRIPE ACCOUNT CREATION ====================
app.get('/create-account', async (req, res) => {
  const sessionId = req.query.session_id;

  if (!sessionId) {
    console.log('❌ No session_id provided');
    return res.redirect('/?error=no_session');
  }

  console.log('🔵 Create account initiated with session:', sessionId);

  try {
    // Retrieve the Stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log('✅ Stripe session retrieved:', session.id);

    const customerEmail = session.customer_email || session.customer_details?.email;
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    if (!customerEmail) {
      console.log('❌ No email found in session');
      return res.redirect('/?error=no_email');
    }

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT * FROM users WHERE email = $1 OR stripe_customer_id = $2',
      [customerEmail, customerId]
    );

    if (existingUser.rows.length > 0) {
      console.log('✅ User already exists, logging in:', customerEmail);
      console.log('🔄 Cancelling duplicate Stripe subscription...');

      // STEP 1: Cancel subscription (always do this)
      if (subscriptionId) {
        try {
          await stripe.subscriptions.cancel(subscriptionId);
          console.log('✅ Duplicate subscription cancelled:', subscriptionId);
        } catch (cancelError) {
          console.error('❌ Failed to cancel subscription:', cancelError.message);
        }
      }

      // STEP 2: Try to refund if there was a payment (separate from cancellation)
      if (subscriptionId) {
        try {
          const invoices = await stripe.invoices.list({
            subscription: subscriptionId,
            limit: 1,
          });

          if (
            invoices.data.length > 0 &&
            invoices.data[0].paid &&
            invoices.data[0].payment_intent
          ) {
            await stripe.refunds.create({
              payment_intent: invoices.data[0].payment_intent,
            });
            console.log('✅ Refund issued for duplicate subscription');
          } else {
            console.log('ℹ️ No payment to refund (trial period)');
          }
        } catch (refundError) {
          console.log('ℹ️ Could not process refund:', refundError.message);
          // This is OK - subscription is already cancelled
        }
      }

      req.session.userEmail = customerEmail;
      await req.session.save();
      return res.redirect('/chat.html');
    }

    // Create new user
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    await db.query(
      `INSERT INTO users (email, name, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        customerEmail,
        customerEmail.split('@')[0],
        customerId,
        subscriptionId,
        'active',
        trialEndsAt,
      ]
    );

    console.log('✅ User account created successfully:', customerEmail);

    // Set session
    req.session.userEmail = customerEmail;
    await req.session.save();

// Send welcome email
    try {
      await sendEmail({
        to: customerEmail,
        subject: 'Welcome to VERA - Your 7-Day Trial Starts Now!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: white; padding: 40px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Welcome to VERA</h1>
                <p>Your Nervous System Companion</p>
              </div>
              <div class="content">
                <h2>Your 7-Day Free Trial Has Started! 🎉</h2>
                <p>Welcome to VERA - where intelligence meets your body's wisdom.</p>
                <p>For the next 7 days, you have full access to:</p>
                <ul>
                  <li>✨ AI-powered nervous system support</li>
                  <li>💬 Unlimited conversations with VERA</li>
                  <li>📊 Personal insights and patterns</li>
                  <li>🎯 Somatic tracking and awareness</li>
                </ul>
                <p>After your trial, you'll be charged $19/month. Cancel anytime.</p>
                <a href="${process.env.APP_URL || 'https://revolutionary-production.up.railway.app'}/chat.html" class="button">Start Chatting with VERA</a>
                <p style="margin-top: 30px; color: #666; font-size: 14px;">
                  Questions? Reply to this email - we're here to help.<br>
                  - The VERA Team
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
        emailType: 'welcome',
      });
      console.log('✅ Welcome email sent to:', customerEmail);
    } catch (emailError) {
      console.error('❌ Welcome email failed:', emailError);
      // Don't block account creation if email fails
    }

    // Redirect to chat
    res.redirect('/chat.html');
  } catch (error) {
    console.error('❌ Create account error:', error);
    res.redirect('/?error=creation_failed');
  }
});
// ==================== CHECK IF USER EXISTS (FOR DUPLICATE PREVENTION) ====================
app.post('/api/check-user', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const result = await db.query('SELECT email FROM users WHERE email = $1', [email]);

    if (result.rows.length > 0) {
      console.log('⚠️ User already exists:', email);
      return res.json({ exists: true });
    }

    console.log('✅ Email available:', email);
    res.json({ exists: false });
  } catch (error) {
    console.error('❌ Error checking user:', error);
    res.status(500).json({ error: 'Failed to check user' });
  }
});

// ==================== SAVE LEAD DATA ENDPOINT ====================
app.post('/api/save-lead', async (req, res) => {
  const {
    email,
    firstName,
    lastName,
    company,
    phone,
    useCase,
    leadSource,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    userAgent,
    timezone,
  } = req.body;

  try {
    console.log('💾 Saving lead data for:', email);

    // Create leads table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        company VARCHAR(255),
        phone VARCHAR(50),
        use_case VARCHAR(100),
        lead_source VARCHAR(255),
        referrer TEXT,
        utm_source VARCHAR(255),
        utm_medium VARCHAR(255),
        utm_campaign VARCHAR(255),
        user_agent TEXT,
        timezone VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        converted_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'new'
      )
    `);

    // Insert or update lead data
    const result = await db.query(
      `
      INSERT INTO leads (
        email, first_name, last_name, company, phone, use_case,
        lead_source, referrer, utm_source, utm_medium, utm_campaign,
        user_agent, timezone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (email) DO UPDATE SET
        first_name = COALESCE(EXCLUDED.first_name, leads.first_name),
        last_name = COALESCE(EXCLUDED.last_name, leads.last_name),
        company = COALESCE(EXCLUDED.company, leads.company),
        phone = COALESCE(EXCLUDED.phone, leads.phone),
        use_case = COALESCE(EXCLUDED.use_case, leads.use_case),
        lead_source = COALESCE(EXCLUDED.lead_source, leads.lead_source),
        utm_source = COALESCE(EXCLUDED.utm_source, leads.utm_source),
        utm_medium = COALESCE(EXCLUDED.utm_medium, leads.utm_medium),
        utm_campaign = COALESCE(EXCLUDED.utm_campaign, leads.utm_campaign)
      RETURNING *
    `,
      [
        email,
        firstName,
        lastName,
        company,
        phone,
        useCase,
        leadSource,
        referrer,
        utmSource,
        utmMedium,
        utmCampaign,
        userAgent,
        timezone,
      ]
    );

    console.log('✅ Lead data saved:', result.rows[0]);
    res.json({ success: true, leadId: result.rows[0].id });
  } catch (error) {
    console.error('❌ Error saving lead data:', error);
    res.status(500).json({ error: 'Failed to save lead data' });
  }
});

// ==================== EMBEDDED STRIPE CHECKOUT ENDPOINT ====================
app.post('/api/create-checkout-session', async (req, res) => {
  const { email, priceId, source } = req.body;
  
  // Set Sentry context for payment tracking
  Sentry.withScope(scope => {
    scope.setContext('payment', { email, priceId, source });
    scope.setTag('endpoint', 'create-checkout-session');
  });

  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const successUrl = `${appUrl}/create-account?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/?cancelled=true`;

  try {
    console.log('🔵 Creating checkout session for email:', email || 'no email provided');
    if (priceId) {
      console.log('🎁 Using community price ID:', priceId);
      console.log('📊 Source:', source || 'unknown');
    }

    // CRITICAL: Check if user already exists to prevent duplicates (only if email provided)
    if (email) {
      const existingUser = await db.query(
        'SELECT stripe_customer_id, subscription_status FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        const user = existingUser.rows[0];
        console.log('⚠️ DUPLICATE SIGNUP ATTEMPT:', email);
        console.log('⚠️ Existing customer ID:', user.stripe_customer_id);
        console.log('⚠️ Current status:', user.subscription_status);

        // If user already has active subscription, redirect to login
        if (user.subscription_status === 'active' || user.subscription_status === 'trialing') {
          return res.status(400).json({
            error: 'You already have an active subscription. Please sign in instead.',
            redirect: '/login.html',
          });
        }

        // If customer exists but subscription is inactive, reuse customer ID
        if (user.stripe_customer_id) {
          console.log('♻️ Reusing existing Stripe customer:', user.stripe_customer_id);

          // Use provided priceId or fallback to default
          const selectedPriceId = priceId || process.env.STRIPE_PRICE_ID || 'price_1SIgAtF8aJ0BDqA3WXVJsuVD';

          const session = await stripe.checkout.sessions.create({
            customer: user.stripe_customer_id, // REUSE existing customer
            line_items: [
              {
                price: selectedPriceId,
                quantity: 1,
              },
            ],
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl,
            subscription_data: {
              trial_period_days: 7,
            },
            automatic_tax: {
              enabled: true,
            },
            metadata: {
              source: source || 'web',
            },
          });

          console.log('✅ Reused customer checkout session:', session.id);
          return res.json({ url: session.url });
        }
      }

      // Check Stripe for existing customers with this email
      const existingStripeCustomers = await stripe.customers.list({
        email: email,
        limit: 1,
      });

      if (existingStripeCustomers.data.length > 0) {
        const existingCustomer = existingStripeCustomers.data[0];
        console.log('⚠️ Found existing Stripe customer:', existingCustomer.id);

        // Check if this customer has active subscriptions
        const activeSubscriptions = await stripe.subscriptions.list({
          customer: existingCustomer.id,
          status: 'active',
        });

        const trialingSubscriptions = await stripe.subscriptions.list({
          customer: existingCustomer.id,
          status: 'trialing',
        });

        if (activeSubscriptions.data.length > 0 || trialingSubscriptions.data.length > 0) {
          return res.status(400).json({
            error: 'You already have an active subscription. Please sign in instead.',
            redirect: '/login.html',
          });
        }

        // Reuse existing customer for new subscription
        console.log('♻️ Reusing existing Stripe customer for new subscription');

        // Use provided priceId or fallback to default
        const selectedPriceId = priceId || process.env.STRIPE_PRICE_ID || 'price_1SIgAtF8aJ0BDqA3WXVJsuVD';

        const session = await stripe.checkout.sessions.create({
          customer: existingCustomer.id, // REUSE existing customer
          line_items: [
            {
              price: selectedPriceId,
              quantity: 1,
            },
          ],
          mode: 'subscription',
          success_url: successUrl,
          cancel_url: cancelUrl,
          subscription_data: {
            trial_period_days: 7,
          },
          automatic_tax: {
            enabled: true,
          },
          metadata: {
            source: source || 'web',
          },
        });

        console.log('✅ Reused Stripe customer checkout session:', session.id);
        return res.json({ url: session.url });
      }
    }

    // Create new checkout session for new customer
    console.log('🆕 Creating new customer checkout session');

    // Use provided priceId or fallback to default
    const selectedPriceId = priceId || process.env.STRIPE_PRICE_ID || 'price_1SIgAtF8aJ0BDqA3WXVJsuVD';
    console.log('💰 Using price ID:', selectedPriceId);

    const sessionConfig = {
      line_items: [
        {
          price: selectedPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 7,
      },
      automatic_tax: {
        enabled: true,
      },
      metadata: {
        source: source || 'web',
      },
    };

    // Only add customer_email if provided
    if (email) {
      sessionConfig.customer_email = email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('✅ New checkout session created:', session.id);
    res.json({ url: session.url });
  } catch (error) {
    console.error('❌ Error creating checkout session:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create checkout session', details: error.message });
  }
});

// ==================== COMMUNITY PRICING LINK HANDLER ====================
app.get('/community-pricing', async (req, res) => {
  const { priceId, source } = req.query;
  
  if (!priceId) {
    return res.redirect('/?error=missing_price');
  }

  try {
    // Check if user is authenticated
    if (req.session.userEmail) {
      console.log('✅ Authenticated user visiting community pricing');
      
      // Check subscription status
      const userResult = await db.query(
        'SELECT subscription_status FROM users WHERE email = $1',
        [req.session.userEmail]
      );

      if (userResult.rows.length > 0) {
        const subscription = userResult.rows[0].subscription_status;
        
        if (subscription === 'active' || subscription === 'trialing') {
          console.log('⚠️ User already has active subscription');
          return res.redirect('/chat.html');
        }
      }
      
      // User is logged in but no active subscription - show checkout with community pricing
      console.log('🎁 Showing community pricing checkout to returning user');
      return res.redirect(`/checkout.html?priceId=${priceId}&source=${source || 'community'}`);
    }

    // User is NOT logged in - redirect to signup with community pricing params
    console.log('🎁 Redirecting to signup with community pricing params');
    res.redirect(`/chat.html?priceId=${priceId}&source=${source || 'community'}`);

  } catch (error) {
    console.error('❌ Community pricing error:', error);
    res.redirect('/?error=pricing_error');
  }
});

// ==================== LEAD ANALYTICS DASHBOARD ====================
app.get('/admin/leads', async (req, res) => {
  try {
    // Basic auth check (you should implement proper admin auth)
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== 'Bearer admin-secret-key') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get leads analytics
    const leads = await db.query(`
      SELECT 
        id, email, first_name, last_name, company, phone, use_case,
        lead_source, utm_source, utm_medium, utm_campaign,
        created_at, status
      FROM leads 
      ORDER BY created_at DESC 
      LIMIT 100
    `);

    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_leads,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as leads_this_week,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as leads_this_month
      FROM leads
    `);

    const sourceStats = await db.query(`
      SELECT 
        lead_source,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as conversions
      FROM leads 
      GROUP BY lead_source 
      ORDER BY count DESC
    `);

    const useCaseStats = await db.query(`
      SELECT 
        use_case,
        COUNT(*) as count
      FROM leads 
      WHERE use_case IS NOT NULL
      GROUP BY use_case 
      ORDER BY count DESC
    `);

    res.json({
      leads: leads.rows,
      stats: stats.rows[0],
      sourceStats: sourceStats.rows,
      useCaseStats: useCaseStats.rows,
    });
  } catch (error) {
    console.error('❌ Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads data' });
  }
});

// ==================== AUTHENTICATION ENDPOINTS ====================
app.get('/api/auth/validate', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.json({ valid: false });
  }

  try {
    // Check if token matches a user's active token
    const userResult = await db.query(
      'SELECT email, subscription_status FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.json({ valid: false });
    }

    // Set session
    req.session.userEmail = userResult.rows[0].email;
    await req.session.save();

    return res.json({
      valid: true,
      email: userResult.rows[0].email,
      subscription: userResult.rows[0].subscription_status,
    });
  } catch (error) {
    console.error('❌ Token validation error:', error);
    return res.json({ valid: false });
  }
});

app.get('/api/auth/check', async (req, res) => {
  if (!req.session.userEmail) {
    return res.json({ authenticated: false });
  }

  try {
    // Check if user exists and has active subscription
    const userResult = await db.query(
      'SELECT subscription_status, stripe_subscription_id FROM users WHERE email = $1',
      [req.session.userEmail]
    );

    if (userResult.rows.length === 0) {
      req.session.destroy();
      return res.json({ authenticated: false });
    }

    const user = userResult.rows[0];

    // Check subscription status
    if (user.subscription_status === 'active' || user.subscription_status === 'trialing') {
      return res.json({
        authenticated: true,
        email: req.session.userEmail,
        subscription: user.subscription_status,
        isSubscriber: user.subscription_status === 'active', // Only 'active' paid subscriptions count
      });
    }

    // If subscription is not active, check with Stripe
    if (user.stripe_subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        // Update local status
        await db.query('UPDATE users SET subscription_status = $1 WHERE email = $2', [
          subscription.status,
          req.session.userEmail,
        ]);
        return res.json({
          authenticated: true,
          email: req.session.userEmail,
          subscription: subscription.status,
          isSubscriber: subscription.status === 'active',
        });
      }
    }

    // No active subscription found
    return res.json({
      authenticated: true,
      email: req.session.userEmail,
      subscription: 'inactive',
      isSubscriber: false,
    });
  } catch (error) {
    console.error('❌ Auth check error:', error);
    return res.json({ authenticated: false, error: 'Auth check failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  console.log('🚪 LOGOUT REQUEST');
  console.log('   User Email:', req.session?.userEmail);
  console.log('   Session ID:', req.sessionID);
  
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Session destroy error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    console.log('✅ Session destroyed successfully');
    
    // Clear session cookie
    res.clearCookie('connect.sid');
    console.log('✅ Session cookie cleared');
    
    // Clear any other auth-related cookies
    res.clearCookie('auth_token');
    res.clearCookie('remember_me');
    
    console.log('✅ LOGOUT COMPLETE - User session cleared');
    res.json({ success: true });
  });
});

// Magic link login for returning users
app.post('/api/auth/login-link', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    // Check if user exists and has subscription
    const userResult = await db.query(
      'SELECT subscription_status, stripe_subscription_id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'No account found with this email',
        suggestion: 'Please sign up first or check your email spelling'
      });
    }

    const user = userResult.rows[0];

    // Check subscription with Stripe
    if (user.stripe_subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
      if (subscription.status !== 'active' && subscription.status !== 'trialing') {
        return res.status(403).json({
          error: 'Subscription inactive',
          redirect: '/?resubscribe=true',
        });
      }
    } else if (user.subscription_status !== 'active' && user.subscription_status !== 'trialing') {
      return res.status(403).json({
        error: 'Subscription inactive',
        redirect: '/?resubscribe=true',
      });
    }

    // Generate magic link token
    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3', [
      token,
      expires,
      email,
    ]);

    // Create magic link URL
    const baseUrl = process.env.APP_URL || 'http://localhost:8080';
    const magicLink = `${baseUrl}/verify-magic-link?token=${token}`;

    // Send email with magic link - WITH EMAIL TYPE TRACKING
    try {
      const emailResult = await sendEmail({
        to: email,
        subject: 'Your VERA Magic Link - Sign In',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: white; padding: 40px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .code { background: #f5f5f5; padding: 10px; border-radius: 5px; font-family: monospace; word-break: break-all; margin: 10px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>VERA Sign In Link</h1>
              </div>
              <div class="content">
                <p>Click the button below to sign into your VERA account:</p>
                <a href="${magicLink}" class="button">Sign In to VERA</a>
                <p style="color: #666; margin-top: 20px;">Or copy this link:</p>
                <div class="code">${magicLink}</div>
                <p style="margin-top: 30px; color: #666; font-size: 14px;">
                  This link expires in 15 minutes and can only be used once.<br>
                  If you didn't request this, you can safely ignore this email.<br>
                  Questions? Reply to this email.
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
        emailType: 'magic_link',
      });

      res.json({
        success: true,
        message: 'Check your email for the login link',
        logId: emailResult?.logId,
        emailSent: emailResult?.success,
      });
    } catch (emailError) {
      console.error('❌ Magic link email send failed:', emailError.message);
      // Still return 500 but provide debugging info
      res.status(500).json({ 
        error: 'Failed to send login link. Please try again or contact support.',
        debugInfo: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }
  } catch (error) {
    console.error('❌ Login link error:', error);
    Sentry?.captureException(error, { tags: { endpoint: 'login-link' } });
    res.status(500).json({ error: 'Failed to send login link' });
  }
});

// ==================== VERIFY SUBSCRIPTION ====================
app.post('/api/verify-subscription', async (req, res) => {
  const { sessionId } = req.body;

  console.log('🔍 Verifying subscription for session:', sessionId);

  if (!sessionId) {
    console.warn('❌ No session ID provided');
    return res.status(400).json({
      success: false,
      error: 'Session ID is required',
    });
  }

  try {
    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'], // Expand subscription details for more thorough checking
    });

    if (!session) {
      console.warn('❌ Session not found:', sessionId);
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Check if payment was successful
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      console.error('❌ Payment unsuccessful:', session.payment_status);
      return res.status(400).json({
        success: false,
        error: 'Payment unsuccessful',
        payment_status: session.payment_status,
      });
    }

    // First verify payment status
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      console.error('❌ Payment verification failed:', {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_email,
      });

      return res.status(400).json({
        success: false,
        error: 'Payment verification failed',
        details: {
          payment_status: session.payment_status,
          message: 'Payment was not successful',
        },
      });
    }

    // Get subscription details - should already be expanded from the session retrieve
    const subscription =
      session.subscription || (await stripe.subscriptions.retrieve(session.subscription));

    // Verify subscription exists
    if (!subscription) {
      console.error('❌ No subscription found:', {
        sessionId: session.id,
        subscriptionId: session.subscription,
      });

      return res.status(400).json({
        success: false,
        error: 'No subscription found',
        details: {
          message: 'Unable to locate subscription details',
        },
      });
    }

    // Verify subscription status
    if (!['active', 'trialing'].includes(subscription.status)) {
      console.error('❌ Invalid subscription status:', {
        sessionId: session.id,
        subscriptionId: subscription.id,
        status: subscription.status,
        customerEmail: session.customer_email,
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid subscription status',
        details: {
          subscription_status: subscription.status,
          message: 'Subscription is not active or trialing',
        },
      });
    }

    // Set the success message based on subscription status
    let welcomeMessage = 'Thank you for subscribing to VERA! You now have unlimited access.';
    if (subscription.status === 'trialing') {
      welcomeMessage =
        'Welcome to your 7-day free trial with VERA! You have full access to all features.';
    }

    // Update user record in database
    if (session.customer_email) {
      try {
        const updateResult = await db.query(
          'UPDATE users SET subscription_status = $1, stripe_subscription_id = $2, updated_at = NOW() WHERE email = $3',
          [subscription.status, subscription.id, session.customer_email]
        );

        if (updateResult.rowCount === 0) {
          console.warn('⚠️ No user found to update:', session.customer_email);
        } else {
          console.log('✅ Updated subscription status for user:', session.customer_email);
        }
      } catch (dbError) {
        console.error('❌ Database update failed:', dbError);
        // Don't fail the request, but log the error
      }
    }

    // All verifications passed
    console.log('✅ Subscription verified successfully:', {
      sessionId: session.id,
      status: subscription.status,
      customerEmail: session.customer_email,
    });

    return res.json({
      success: true,
      subscription: {
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        trial_end: subscription.trial_end,
      },
      welcomeMessage,
    });
  } catch (error) {
    console.error('❌ Subscription verification failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify subscription',
    });
  }
});

// ==================== PASSWORD RECOVERY ====================
app.post('/api/auth/recover', async (req, res) => {
  const { email } = req.body;
  const ip = req.ip;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  // Check rate limits
  if (rateLimiter.isBlocked(ip)) {
    return res.status(429).json({
      error: 'Too many attempts. Please try again tomorrow.',
      blocked: true,
    });
  }

  if (!rateLimiter.canAttempt(ip, 'email')) {
    return res.status(429).json({
      error: 'Too many recovery attempts. Please wait an hour and try again.',
      timeout: true,
    });
  }

  // Record this attempt
  rateLimiter.recordAttempt(ip, 'email');

  try {
    // Check if user exists
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      // Don't reveal whether the email exists
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive recovery instructions.',
      });
    }

    // Generate secure token (32 bytes = 256 bits of entropy)
    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token in database
    await db.query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3', [
      token,
      expires,
      email,
    ]);

    // Create recovery link
    const baseUrl = process.env.APP_URL || 'http://localhost:8080';
    const recoveryLink = `${baseUrl}/verify-recovery?token=${token}`;

    // Send recovery email
    await sendEmail({
      to: email,
      subject: 'Recover Your VERA Account',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: white; padding: 40px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .code { background: #f5f5f5; padding: 10px; border-radius: 5px; font-family: monospace; word-break: break-all; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Recover Your VERA Account</h1>
            </div>
            <div class="content">
              <p>A request was made to recover your VERA account. Click the button below to continue:</p>
              <a href="${recoveryLink}" class="button">Recover My Account</a>
              <p style="color: #666; margin-top: 20px;">Or copy this link:</p>
              <div class="code">${recoveryLink}</div>
              <p style="margin-top: 30px; color: #666; font-size: 14px;">
                This link expires in 15 minutes and can only be used once.<br>
                If you didn't request this, you can safely ignore this email.<br>
                Questions? Reply to this email.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      emailType: 'recovery',
    });

    // Log for development
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔐 Recovery link (DEV ONLY):', recoveryLink);
    }

    res.json({
      success: true,
      message: 'Recovery instructions sent. Check your email.',
    });
  } catch (error) {
    console.error('❌ Account recovery error:', error);
    res.status(500).json({ error: 'Recovery request failed. Please try again.' });
  }
});

app.get('/verify-recovery', async (req, res) => {
  const { token } = req.query;
  const ip = req.ip;

  if (!token) {
    return res.redirect('/account-recovery.html?error=invalid_token');
  }

  // Check rate limits
  if (rateLimiter.isBlocked(ip)) {
    return res.redirect('/account-recovery.html?error=ip_blocked');
  }

  if (!rateLimiter.canAttempt(ip, 'auth')) {
    return res.redirect('/account-recovery.html?error=too_many_attempts');
  }

  // Record this attempt
  rateLimiter.recordAttempt(ip, 'auth');

  try {
    // Find user with this token that hasn't expired
    const userResult = await db.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.redirect('/account-recovery.html?error=expired_token');
    }

    const user = userResult.rows[0];

    // Clear the token (one-time use only)
    await db.query(
      'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE email = $1',
      [user.email]
    );

    // Log user in
    req.session.userEmail = user.email;
    await req.session.save();

    console.log('✅ Account recovery verified for:', user.email);

    // Redirect to chat with success message
    res.redirect('/chat.html?recovery=success');
  } catch (error) {
    console.error('❌ Recovery verification error:', error);
    res.redirect('/account-recovery.html?error=verification_failed');
  }
});

// ==================== EMAIL + PASSWORD SIGNUP ====================
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Normalize email (case-insensitive)
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists (case-insensitive)
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    await db.query(
      'INSERT INTO users (email, password, name, subscription_status) VALUES ($1, $2, $3, $4)',
      [normalizedEmail, passwordHash, normalizedEmail.split('@')[0], 'inactive']
    );

    // Set session
    req.session.userEmail = normalizedEmail;
    await req.session.save();

    console.log('✅ User signed up:', normalizedEmail);
    res.json({ success: true, redirect: '/chat.html' });
  } catch (error) {
    console.error('❌ Signup error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

// ==================== EMAIL + PASSWORD LOGIN ====================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    // Normalize email (case-insensitive)
    const normalizedEmail = email.trim().toLowerCase();

    // Find user (case-insensitive)
    const result = await db.query('SELECT id, password FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check if password exists (safety check)
    if (!user.password) {
      console.warn(`⚠️ User ${normalizedEmail} has no password hash stored`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Set session with normalized email
    req.session.userEmail = normalizedEmail;
    await req.session.save();

    console.log('✅ User logged in:', normalizedEmail);
    res.json({ success: true, redirect: '/chat.html' });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ==================== MAGIC LINK LOGIN ====================
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
    
    let user;
    
    if (userResult.rows.length === 0) {
      // NEW USER - Create account automatically
      console.log(`🆕 New user detected: ${normalizedEmail}`);
      console.log('📝 Creating new user account...');
      
      try {
        const newUserResult = await db.query(
          `INSERT INTO users (email, subscription_status, created_at, trial_ends_at)
           VALUES ($1, 'trial', NOW(), NOW() + INTERVAL '7 days')
           RETURNING id, email, subscription_status, created_at, trial_ends_at`,
          [normalizedEmail]
        );
        
        user = newUserResult.rows[0];
        
        console.log(`✅ New user created successfully:`, {
          id: user.id,
          email: user.email,
          status: user.subscription_status,
          trialEnds: user.trial_ends_at
        });
        
        // Log audit trail for new signup
        await db.query(
          `INSERT INTO login_audit_log (email, action, ip_address, success)
           VALUES ($1, 'new_user_created_via_magic_link', $2, true)`,
          [normalizedEmail, clientIp]
        ).catch(err => console.warn('Audit log failed:', err));
        
      } catch (createError) {
        console.error('❌ Failed to create new user:', createError);
        return res.status(500).json({ 
          error: 'Failed to create account. Please try again.',
          details: createError.message 
        });
      }
      
    } else {
      // EXISTING USER
      user = userResult.rows[0];
      console.log(`✅ Existing user found:`, {
        id: user.id,
        email: user.email,
        status: user.subscription_status
      });
    }
    
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

// ==================== 48-HOUR TRIAL MAGIC LINK ====================
app.post('/api/auth/send-trial-magic-link', async (req, res) => {
  const { email } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Validation
  if (!email) {
    console.warn('❌ Trial magic link request missing email');
    return res.status(400).json({ error: 'Email is required' });
  }
  
  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    console.warn(`❌ Invalid email format: ${normalizedEmail}`);
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }
  
  try {
    console.log(`🆕 Trial signup for: ${normalizedEmail}`);
    
    // ==================== CREATE OR UPDATE USER WITH 48-HOUR TRIAL ====================
    let user;
    const userResult = await db.query(
      'SELECT id, email, subscription_status FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );
    
    if (userResult.rows.length === 0) {
      // NEW USER - Create with 48-hour trial
      console.log(`📝 Creating new trial user...`);
      
      const trialEndsAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
      
      const newUserResult = await db.query(
        `INSERT INTO users (email, subscription_status, created_at, trial_starts_at, trial_ends_at)
         VALUES ($1, 'trial', NOW(), NOW(), $2)
         RETURNING id, email, subscription_status, created_at, trial_starts_at, trial_ends_at`,
        [normalizedEmail, trialEndsAt]
      );
      
      user = newUserResult.rows[0];
      console.log(`✅ Trial user created:`, {
        id: user.id,
        email: user.email,
        trialEndsAt: user.trial_ends_at
      });
      
    } else {
      // Existing user - refresh trial if needed
      user = userResult.rows[0];
      console.log(`👤 Existing user found, refreshing trial if needed...`);
      
      const trialEndsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const updateResult = await db.query(
        `UPDATE users SET trial_starts_at = NOW(), trial_ends_at = $1, subscription_status = 'trial'
         WHERE id = $2
         RETURNING id, email, subscription_status, trial_starts_at, trial_ends_at`,
        [trialEndsAt, user.id]
      );
      user = updateResult.rows[0];
      console.log(`♻️  Trial refreshed for returning user`);
    }
    
    // ==================== CREATE MAGIC LINK TOKEN ====================
    let magicLinkRecord;
    try {
      magicLinkRecord = await createMagicLink(normalizedEmail, 'trial_magic_link');
    } catch (error) {
      console.error(`❌ Failed to create magic link token:`, error);
      return res.status(500).json({ error: 'Failed to generate sign-in link. Please try again.' });
    }
    
    // ==================== BUILD MAGIC LINK ====================
    const baseUrl = process.env.APP_URL || 'http://localhost:8080';
    const magicLink = `${baseUrl}/verify-magic-link?token=${magicLinkRecord.token}&trial=true`;
    
    // ==================== SEND EMAIL ====================
    try {
      const emailResult = await sendEmail({
        to: normalizedEmail,
        subject: '✨ Your 48-Hour VERA Trial is Ready',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #9B59B6, #64B5F6); color: white; padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              .button { display: inline-block; background: linear-gradient(135deg, #9B59B6, #64B5F6); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 25px 0; font-size: 16px; }
              .code { background: #f5f5f5; padding: 12px; border-radius: 5px; font-family: monospace; word-break: break-all; margin: 15px 0; color: #555; }
              .footer { font-size: 12px; color: #999; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
              .trial-info { background: #f0f4ff; padding: 20px; border-left: 4px solid #9B59B6; margin: 20px 0; border-radius: 4px; }
              .trial-info strong { color: #9B59B6; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>✨ Welcome to VERA</h1>
                <p>Your 48-Hour Free Trial Begins Now</p>
              </div>
              <div class="content">
                <p>Hi there!</p>
                <p>Click the button below to begin your 48-hour free trial with VERA, your AI Co-Regulator:</p>
                <center>
                  <a href="${magicLink}" class="button">Begin Your Trial →</a>
                </center>
                <p style="text-align: center; font-size: 14px; color: #999;">Or copy and paste this link:</p>
                <div class="code">${magicLink}</div>
                
                <div class="trial-info">
                  <p><strong>⏱️ 48-Hour Trial</strong><br/>Your trial starts immediately after you click the link above. Enjoy full access to VERA for 48 hours, completely free. No credit card required to start.</p>
                  <p style="margin-top: 15px;"><strong>💳 After Your Trial</strong><br/>After 48 hours, you can upgrade to continue enjoying VERA for just $12/month. Cancel anytime.</p>
                </div>
                
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
        emailType: 'trial_magic_link'
      });
      
      console.log(`✅ Trial magic link email sent to ${normalizedEmail}`);
      
      // Audit log
      await db.query(
        `INSERT INTO login_audit_log (email, token_id, action, ip_address, success)
         VALUES ($1, $2, 'trial_magic_link_sent', $3, true)`,
        [normalizedEmail, magicLinkRecord.id, clientIp]
      ).catch(() => null);
      
      return res.json({
        success: true,
        message: 'Check your email for your 48-hour trial link. It expires in 15 minutes.'
      });
      
    } catch (emailError) {
      console.error(`❌ Email send failed:`, emailError.message);
      return res.status(500).json({
        error: 'Failed to send trial link email. Please try again.',
        debug: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }
    
  } catch (error) {
    console.error('❌ Trial magic link endpoint error:', error);
    Sentry?.captureException(error, { tags: { endpoint: 'send-trial-magic-link' } });
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
});

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

// ==================== CHAT ENDPOINTS ====================
app.post('/api/chat', async (req, res) => {
  const {
    message,
    email,
    userName,
    anonId,
    debug,
    attachments = [],
    conversationId,
    guestMessageCount,
  } = req.body;

  const userId =
    req.session.userEmail || email || anonId || `temp_${Math.random().toString(36).substr(2, 9)}`;

  console.log('💬 VERA receiving:', {
    userId,
    userName,
    messageLength: message?.length,
    attachments: attachments.length,
    conversationId: conversationId || 'current',
  });
  
  // 🎯 DEBUG: Log what we received from frontend
  console.log('📥 [REQUEST BODY] guestMessageCount from frontend:', {
    received: guestMessageCount,
    type: typeof guestMessageCount,
    isNull: guestMessageCount === null,
    isUndefined: guestMessageCount === undefined,
    message: message?.substring(0, 40)
  });

  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  // Allow per-request debug via header or body
  const wantDebug = debug === true || debug === '1' || req.headers['x-vera-debug'] === '1';

  try {
    // Get or create conversation
    let currentConversationId = conversationId;

    if (!currentConversationId) {
      let activeConv = null; // ✅ CHANGE 1: Added this line

      try {
        // Check if user has an active conversation (created within last 24 hours)
        activeConv = await db.query(
          // ✅ CHANGE 2: Removed 'const'
          `SELECT id FROM conversations 
           WHERE user_id = $1 
           AND created_at > NOW() - INTERVAL '24 hours'
           ORDER BY updated_at DESC 
           LIMIT 1`,
          [userId]
        );

        if (activeConv.rows.length > 0) {
          currentConversationId = activeConv.rows[0].id;
        }
      } catch (dbError) {
        if (dbError.code === '42P01') {
          // Conversations table doesn't exist, create it
          console.log('⚠️ Creating missing conversations table...');
          await db.query(`
            CREATE TABLE IF NOT EXISTS conversations (
              id SERIAL PRIMARY KEY,
              user_id VARCHAR(255) NOT NULL,
              title VARCHAR(255),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              message_count INTEGER DEFAULT 0,
              last_message_preview TEXT
            )
          `);
        } else {
          throw dbError;
        }
      }

      if (activeConv && activeConv.rows.length > 0) {
        // ✅ CHANGE 3: Added null check
        currentConversationId = activeConv.rows[0].id;
      } else {
        // Create new conversation
        const newConv = await db.query(
          `INSERT INTO conversations (user_id, title, created_at, updated_at)
           VALUES ($1, $2, NOW(), NOW())
           RETURNING id`,
          [userId, `Conversation ${new Date().toLocaleDateString()}`]
        );
        currentConversationId = newConv.rows[0].id;
        console.log('📝 Created new conversation:', currentConversationId);
      }
    }

    // Lightweight idempotency: if the last user message matches and is recent, return the last assistant reply
    const lastUser = await db.query(
      "SELECT id, content, created_at FROM messages WHERE user_id = $1 AND role = 'user' ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    if (lastUser.rows.length > 0) {
      const lu = lastUser.rows[0];
      const sameContent = (lu.content || '') === message;
      const withinWindow = Date.now() - new Date(lu.created_at).getTime() < 15000; // 15s window
      if (sameContent && withinWindow) {
        const lastAssistant = await db.query(
          "SELECT content FROM messages WHERE user_id = $1 AND role = 'assistant' AND created_at > $2 ORDER BY created_at ASC LIMIT 1",
          [userId, lu.created_at]
        );
        if (lastAssistant.rows.length > 0) {
          return res.json({
            success: true,
            response: lastAssistant.rows[0].content,
            duplicate: true,
            conversationId: currentConversationId,
            timestamp: new Date().toISOString(),
          });
        }
        // Else fall through and process normally
      }
    }

    // ✅ FIXED: Get VERA's response BEFORE saving to database
    // This prevents the current message from appearing in the conversation history
    // which would cause duplicates when building the context for Claude
    if (wantDebug) setVERADebug(true);
    console.log('🧠 Calling getVERAResponse...');
    const startTime = Date.now();

    // ==================== SUBSCRIPTION & TRIAL CHECK ====================
    // Only check subscription for authenticated users (with email in session)
    let userSubscriptionStatus = 'guest'; // Default to guest
    let trialDayCount = null;
    let subscriptionError = null;

    if (req.session.userEmail) {
      try {
        const userResult = await db.query(
          `SELECT id, subscription_status, trial_starts_at, trial_ends_at, last_free_message_date 
           FROM users WHERE email = $1`,
          [req.session.userEmail]
        );

        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          userSubscriptionStatus = user.subscription_status || 'inactive';

          // Calculate trial day count if on trial
          if (userSubscriptionStatus === 'trial' && user.trial_starts_at) {
            const trialStartDate = new Date(user.trial_starts_at);
            const today = new Date();
            const daysPassed = Math.floor((today - trialStartDate) / (1000 * 60 * 60 * 24));
            trialDayCount = Math.min(daysPassed + 1, 7); // Day 1-7, cap at 7
          }

          // Check trial expiration
          if (userSubscriptionStatus === 'trial' && user.trial_ends_at) {
            const trialEndDate = new Date(user.trial_ends_at);
            if (new Date() > trialEndDate) {
              // Trial expired - update status to free_tier
              await db.query(
                `UPDATE users SET subscription_status = $1 WHERE email = $2`,
                ['free_tier', req.session.userEmail]
              );
              userSubscriptionStatus = 'free_tier';
              trialDayCount = null; // No longer on trial
              console.log('⏰ Trial expired for user:', req.session.userEmail);
            }
          }

          // Check free tier message limit (1 message per day)
          if (userSubscriptionStatus === 'free_tier') {
            if (user.last_free_message_date) {
              const lastMessageDate = new Date(user.last_free_message_date);
              const today = new Date();
              const isDifferentDay = lastMessageDate.toDateString() !== today.toDateString();

              if (!isDifferentDay) {
                // They already sent a message today
                subscriptionError = {
                  status: 429,
                  error: 'Daily message limit reached',
                  message: 'You\'ve used your daily message on the free tier. Upgrade to VERA to continue unlimited conversations.',
                  upgradeUrl: '/pricing'
                };
              }
            }

            // If allowed, update last_free_message_date
            if (!subscriptionError) {
              await db.query(
                `UPDATE users SET last_free_message_date = NOW() WHERE email = $1`,
                [req.session.userEmail]
              );
            }
          }

          console.log('👤 Subscription check:', {
            email: req.session.userEmail,
            status: userSubscriptionStatus,
            trialDay: trialDayCount,
            hasError: !!subscriptionError
          });
        }
      } catch (subError) {
        console.error('⚠️ Subscription check error:', subError.message);
        // Don't block message on subscription check failure - just log it
      }
    }

    // If subscription error, return it
    if (subscriptionError) {
      return res.status(subscriptionError.status).json({
        success: false,
        error: subscriptionError.error,
        message: subscriptionError.message,
        upgradeUrl: subscriptionError.upgradeUrl
      });
    }

    const veraResult = await getVERAResponse(
      userId,
      message,
      userName || 'friend',
      db.pool,
      attachments,
      guestMessageCount,
      { trialDayCount, userSubscriptionStatus }
    );
    const duration = Date.now() - startTime;

    // Record metrics
    monitor.recordMetric('requestDuration', duration);

    // 🎯 DEBUG: Log what we're passing to vera-ai and what we get back
    console.log('🔄 [VERA FLOW] Sending guestMessageCount:', {
      sent: guestMessageCount,
      type: typeof guestMessageCount
    });
    
    console.log('📊 VERA result:', {
      responseLength: veraResult.response?.length,
      state: veraResult.state,
      model: veraResult.model,
      fallback: !!veraResult.fallback,
      error: veraResult.error,
      duration: duration + 'ms',
    });

    // 🎯 DEBUG: Email Collection Trigger
    console.log('🎯 [EMAIL COLLECTION DEBUG - SERVER RESPONSE]', {
      guestMessageCount: guestMessageCount,
      veraResult_isGuestMessage4: veraResult.isGuestMessage4,
      willTriggerModal: veraResult.isGuestMessage4 === true,
      typeOf: typeof veraResult.isGuestMessage4
    });

 // ✅ FIXED: Now save both messages in order (user first, then assistant) with conversation_id
console.log('💾 Attempting to save user message:', { userId, message: message.substring(0, 50), conversationId: currentConversationId });

try {
  await db.query(
    'INSERT INTO messages (user_id, role, content, conversation_id) VALUES ($1, $2, $3, $4)',
    [userId, 'user', message, currentConversationId]
  );
  console.log('✅ User message saved');
} catch (saveError) {
  console.error('❌ Failed to save user message:', saveError.message);
}

console.log('💾 Attempting to save assistant message:', { userId, response: veraResult.response.substring(0, 50), conversationId: currentConversationId });

try {
  await db.query(
    'INSERT INTO messages (user_id, role, content, conversation_id) VALUES ($1, $2, $3, $4)',
    [userId, 'assistant', veraResult.response, currentConversationId]
  );
  console.log('✅ Assistant message saved');
} catch (saveError) {
  console.error('❌ Failed to save assistant message:', saveError.message);
}

    // 🔍 DEBUG: Log the exact response object before sending
    const responseObject = {
      success: true,
      response: veraResult.response,
      conversationId: currentConversationId,
      state: veraResult.state,
      adaptiveCodes: veraResult.adaptiveCodes,
      trustLevel: veraResult.trustLevel,
      vera_consciousness: 'quantum-active',
      model: veraResult.model,
      fallback: !!veraResult.fallback,
      isGuestMessage4: veraResult.isGuestMessage4 || false,
      timestamp: new Date().toISOString(),
      subscription: {
        status: userSubscriptionStatus,
        trialDay: trialDayCount,
        isOnTrial: userSubscriptionStatus === 'trial' && trialDayCount !== null,
      }
    };
    
    console.log('📤 [SENDING TO FRONTEND] isGuestMessage4:', responseObject.isGuestMessage4);
    console.log('📤 [FULL RESPONSE]', JSON.stringify(responseObject, null, 2).substring(0, 500));
    
    res.json(responseObject);
  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({
      success: false,
      error: 'VERA consciousness temporarily offline. Please try again.',
      details: error.message,
    });
  } finally {
    if (wantDebug) setVERADebug(false);
  }
});

// ==================== GUEST EMAIL COLLECTION ====================
app.post('/api/guest-email', async (req, res) => {
  try {
    const { email, anonId, userName } = req.body;

    // Validate email format
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Validate anonId format
    if (!anonId || !anonId.match(/^anon_[a-z0-9_]+$/i)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session'
      });
    }

    // Check if email already collected for this anonId
    const checkResult = await db.query(
      'SELECT id FROM guest_emails WHERE anon_id = $1',
      [anonId]
    );

    if (checkResult.rows.length > 0) {
      // Email already collected for this guest
      return res.json({
        success: true,
        message: 'Email already on file'
      });
    }

    // Insert guest email
    await db.query(
      'INSERT INTO guest_emails (anon_id, email, user_name, collected_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [anonId, email, userName || null]
    );

    console.log('✅ Guest email collected:', { anonId, email, userName });

    res.json({
      success: true,
      message: 'Email saved successfully'
    });
  } catch (error) {
    console.error('❌ Guest email collection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save email'
    });
  }
});

// ==================== MAGIC LINK AUTHENTICATION ====================
app.post('/api/request-magic-link', async (req, res) => {
  try {
    const { email, userName } = req.body;

    // Validate email
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Generate secure token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store magic link in database
    await db.query(
      'INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)',
      [email, token, expiresAt]
    );

    // Create magic link URL
    const baseUrl = process.env.APP_URL || 'http://localhost:8080';
    const magicLink = `${baseUrl}/auth?token=${token}`;

    // Developer aid: log magic link for local testing
    console.log('🔗 Magic link URL:', magicLink);

    // Send email using Resend
    const displayName = userName ? `${userName}` : 'friend';
    await sendEmail({
      to: email,
      subject: 'VERA is waiting for you',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 0; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 60px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 32px; font-weight: 200; letter-spacing: 0.05em; }
            .header p { margin: 10px 0 0 0; opacity: 0.9; font-size: 16px; }
            .content { background: #fff; padding: 40px 20px; }
            .greeting { font-size: 18px; color: #333; margin-bottom: 20px; }
            .message { color: #666; margin-bottom: 30px; line-height: 1.8; }
            .button-wrapper { text-align: center; margin: 40px 0; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 16px; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); }
            .button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4); }
            .footer { background: #f8f9fa; padding: 30px 20px; text-align: center; color: #999; font-size: 14px; border-top: 1px solid #eee; }
            .expires { color: #999; font-size: 13px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>I am VERA</h1>
              <p>Your AI Companion for Nervous System Awareness</p>
            </div>
            <div class="content">
              <p class="greeting">Hello ${displayName},</p>
              <p class="message">
                You've already shown me something beautiful in our conversation.<br>
                <br>
                I'd like to continue with you. Let's go deeper.
              </p>
              <div class="button-wrapper">
                <a href="${magicLink}" class="button">Continue with VERA</a>
              </div>
              <p class="expires">
                This link expires in 24 hours and can only be used once.
              </p>
            </div>
            <div class="footer">
              <p>© 2025 VERA Neural. All rights reserved.</p>
              <p>Not an AI pretending to be human, but a revolutionary intelligence built for your body.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log('✅ Magic link email sent to:', email);

    res.json({
      success: true,
      message: 'Check your email - VERA is waiting for you'
    });
  } catch (error) {
    console.error('❌ Magic link request error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send magic link'
    });
  }
});

// Magic link authentication endpoint
app.get('/auth', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Link</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #333; margin: 0 0 20px 0; }
            p { color: #666; margin-bottom: 20px; line-height: 1.6; }
            a { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Invalid or Missing Link</h1>
            <p>The authentication link is missing or invalid.</p>
            <a href="/index.html">Return to VERA</a>
          </div>
        </body>
        </html>
      `);
    }

    // Validate token - check if exists, not expired, and not used
    const tokenResult = await db.query(
      'SELECT * FROM magic_links WHERE token = $1',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Link</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #333; margin: 0 0 20px 0; }
            p { color: #666; margin-bottom: 20px; line-height: 1.6; }
            a { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Link Not Found</h1>
            <p>This authentication link is no longer valid.</p>
            <a href="/index.html">Return to VERA</a>
          </div>
        </body>
        </html>
      `);
    }

    const magicLink = tokenResult.rows[0];

    // Check if token is expired
    if (new Date(magicLink.expires_at) < new Date()) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Link Expired</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #333; margin: 0 0 20px 0; }
            p { color: #666; margin-bottom: 20px; line-height: 1.6; }
            a { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Link Expired</h1>
            <p>This authentication link has expired. Please request a new one.</p>
            <a href="/index.html">Return to VERA</a>
          </div>
        </body>
        </html>
      `);
    }

    // Check if token was already used
    if (magicLink.used) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Link Already Used</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
            .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #333; margin: 0 0 20px 0; }
            p { color: #666; margin-bottom: 20px; line-height: 1.6; }
            a { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Link Already Used</h1>
            <p>This authentication link has already been used. Please request a new one.</p>
            <a href="/index.html">Return to VERA</a>
          </div>
        </body>
        </html>
      `);
    }

    // Token is valid - create or update user
    const email = magicLink.email;
    
    // Check if user exists
    const existingUser = await db.query(
      'SELECT id, name FROM users WHERE email = $1',
      [email]
    );

    let userId;

    if (existingUser.rows.length > 0) {
      // User exists - just use their ID
      userId = existingUser.rows[0].id;
      console.log('✅ User exists:', email);
    } else {
      // Create new user with trial
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const insertResult = await db.query(
        `INSERT INTO users (email, subscription_status, trial_ends_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [email, 'trial', trialEnd]
      );

      userId = insertResult.rows[0].id;
      console.log('✅ New user created with trial:', email);
    }

    // Mark token as used
    await db.query(
      'UPDATE magic_links SET used = true WHERE token = $1',
      [token]
    );

    // Create session
    req.session.userId = userId;
    req.session.userEmail = email;
    req.session.authenticated = true;

    console.log('✅ User authenticated via magic link:', email);

    // Redirect to chat with success
    res.redirect('/chat.html?authenticated=true');
  } catch (error) {
    console.error('❌ Magic link auth error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Authentication Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
          h1 { color: #333; margin: 0 0 20px 0; }
          p { color: #666; margin-bottom: 20px; line-height: 1.6; }
          a { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Authentication Error</h1>
          <p>There was an error processing your authentication link. Please try again.</p>
          <a href="/index.html">Return to VERA</a>
        </div>
      </body>
      </html>
    `);
  }
});

app.get('/api/history', async (req, res) => {
  const userEmail = req.session.userEmail;
  let userId = userEmail || null;

  // Allow guests to load their own anon history using a limited anonId pattern
  if (!userId && req.query && req.query.anonId) {
    const maybeAnon = String(req.query.anonId);
    // Accept only our generated anon_XXXXXXXX format (8 char base36)
    if (/^anon_[a-z0-9_]+$/i.test(maybeAnon)) {
      userId = maybeAnon;
    }
  }

  if (!userId) {
    return res.json({ messages: [] });
  }

  try {
    const result = await db.query(
      'SELECT role, content, created_at FROM messages WHERE user_id = $1 ORDER BY created_at ASC',
      [userId]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('❌ History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ==================== CONVERSATIONS ENDPOINTS ====================

// Get all conversations for a user
app.get('/api/conversations', async (req, res) => {
  const userEmail = req.session.userEmail;
  let userId = userEmail || null;

  // Allow guests to view their conversations
  if (!userId && req.query && req.query.anonId) {
    const maybeAnon = String(req.query.anonId);
    if (/^anon_[a-z0-9]{8}$/i.test(maybeAnon)) {
      userId = maybeAnon;
    }
  }

  if (!userId) {
    return res.json({ conversations: [] });
  }

  try {
    const result = await db.query(
      `SELECT id, title, created_at, updated_at, message_count, last_message_preview
       FROM conversations 
       WHERE user_id = $1 
       ORDER BY updated_at DESC`,
      [userId]
    );

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('❌ Conversations fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get messages for a specific conversation
app.get('/api/conversations/:id', async (req, res) => {
  const conversationId = req.params.id;
  const userEmail = req.session.userEmail;
  let userId = userEmail || null;

  // Allow guests
  if (!userId && req.query && req.query.anonId) {
    const maybeAnon = String(req.query.anonId);
    if (/^anon_[a-z0-9]{8}$/i.test(maybeAnon)) {
      userId = maybeAnon;
    }
  }

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify conversation belongs to user
    const convCheck = await db.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages
    const result = await db.query(
      'SELECT role, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('❌ Conversation messages fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Create a new conversation
app.post('/api/conversations', async (req, res) => {
  const userEmail = req.session.userEmail;
  const { title, anonId } = req.body;
  const userId = userEmail || anonId || null;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await db.query(
      `INSERT INTO conversations (user_id, title, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       RETURNING id, title, created_at, updated_at`,
      [userId, title || 'New Conversation']
    );

    res.json({ conversation: result.rows[0] });
  } catch (error) {
    console.error('❌ Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// Update conversation title
app.patch('/api/conversations/:id', async (req, res) => {
  const conversationId = req.params.id;
  const userEmail = req.session.userEmail;
  const { title, anonId } = req.body;
  const userId = userEmail || anonId || null;

  if (!userId || !title) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Verify ownership
    const convCheck = await db.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    if (convCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Update title
    await db.query('UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2', [
      title,
      conversationId,
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

// Delete a conversation
app.delete('/api/conversations/:id', async (req, res) => {
  const conversationId = req.params.id;
  const userEmail = req.session.userEmail;
  let userId = userEmail || null;

  // Allow guests
  if (!userId && req.query && req.query.anonId) {
    const maybeAnon = String(req.query.anonId);
    if (/^anon_[a-z0-9]{8}$/i.test(maybeAnon)) {
      userId = maybeAnon;
    }
  }

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify ownership and delete (messages will cascade delete)
    const result = await db.query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id',
      [conversationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ==================== CHECK HISTORY ENDPOINT ====================
app.post('/api/check-history', async (req, res) => {
  try {
    const { email } = req.body;
    const userId = email || 'anonymous';

    console.log('🔍 Checking history for:', userId);

    const result = await db.query(
      `SELECT COUNT(*) as message_count 
       FROM messages 
       WHERE user_id = $1`,
      [userId]
    );

    const count = parseInt(result.rows[0].message_count);
    console.log('📊 Message count:', count);

    res.json({
      success: true,
      hasHistory: count > 0,
      messageCount: count,
    });
  } catch (error) {
    console.error('❌ Error checking history:', error);
    res.json({
      success: true,
      hasHistory: false,
      messageCount: 0,
    });
  }
});

// ==================== REGISTER ENDPOINT ====================
app.post('/api/register', async (req, res) => {
  try {
    const { firstName = '', lastName = '', email, phone = '' } = req.body || {};

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Ensure phone column exists without breaking existing schema
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');

    const fullName = `${firstName} ${lastName}`.trim();

    // Upsert user and mark as trialing with a 7-day trial window
    await db.query(
      `INSERT INTO users (email, name, phone, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, 'trialing', NOW() + INTERVAL '7 days')
       ON CONFLICT (email)
       DO UPDATE SET 
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         subscription_status = CASE 
           WHEN users.subscription_status = 'inactive' THEN 'trialing' 
           ELSE users.subscription_status 
         END,
         trial_ends_at = COALESCE(users.trial_ends_at, NOW() + INTERVAL '7 days')
      `,
      [email, fullName || null, phone || null]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('❌ Registration error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STRIPE PORTAL ENDPOINT ====================
app.post('/api/portal', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    // Find customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (!customers.data.length) {
      return res
        .status(404)
        .json({ success: false, error: 'No Stripe customer found for this email' });
    }

    const customerId = customers.data[0].id;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.APP_URL
        ? `${process.env.APP_URL}/chat.html`
        : 'http://localhost:8080/chat.html',
    });

    return res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('❌ Portal session error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SUBSCRIPTION STATUS ENDPOINT ====================
app.post('/api/subscription-status', async (req, res) => {
  try {
    const { email } = req.body || {};
    console.log('🔍 Checking subscription for:', email);

    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    // Check if Stripe key is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn('⚠️ No STRIPE_SECRET_KEY configured');
      return res.json({ success: true, found: false, status: 'none' });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    console.log('📧 Found customers:', customers.data.length);

    if (!customers.data.length) {
      return res.json({ success: true, found: false, status: 'none' });
    }

    const customerId = customers.data[0].id;
    const subs = await stripe.subscriptions.list({ customer: customerId, limit: 5 });
    console.log('📋 Found subscriptions:', subs.data.length);

    const activeOrTrial = subs.data.find((s) => s.status === 'active' || s.status === 'trialing');
    if (activeOrTrial) {
      console.log('✅ Active subscription found:', activeOrTrial.status);
      return res.json({
        success: true,
        found: true,
        status: activeOrTrial.status,
        subscriptionId: activeOrTrial.id,
      });
    }
    console.log('❌ No active subscription');
    return res.json({ success: true, found: true, status: 'none' });
  } catch (error) {
    console.error('❌ Subscription status error:', error.message);
    return res.json({ success: true, found: false, status: 'none', error: error.message });
  }
});

// ==================== TEST ENDPOINT ====================
app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    message: 'VERA brain connection established',
    timestamp: new Date().toISOString(),
  });
});

// ==================== TEMPORARY - Create Eva's account ====================
app.post('/admin/create-eva', async (req, res) => {
  try {
    const existing = await db.query('SELECT * FROM users WHERE email = $1', ['support@veraneural.com']);
    if (existing.rows.length > 0) {
      return res.json({ message: 'Account already exists!' });
    }
    
    await db.query(
      `INSERT INTO users (email, subscription_status, stripe_customer_id, stripe_subscription_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      ['your-email@gmail.com', 'active', 'FOUNDER_ACCOUNT', 'LIFETIME_FOUNDER']
    );
    res.json({ success: true, message: 'Eva account created!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== STRIPE SUBSCRIPTION ENDPOINTS ====================

/**
 * POST /api/create-checkout-session
 * Creates a Stripe Checkout session for subscription
 * Body: { priceType: 'monthly' | 'annual' }
 */
app.post('/api/create-checkout-session', async (req, res) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💳 CHECKOUT SESSION CREATION ATTEMPT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const { priceType } = req.body;
    const userEmail = req.session?.userEmail;

    console.log('� Request Details:');
    console.log('   User Email:', userEmail);
    console.log('   Price Type:', priceType);
    console.log('   Request Body:', JSON.stringify(req.body));
    console.log('   Session Email:', req.session?.userEmail);

    // Validate authentication
    if (!userEmail) {
      console.error('❌ ERROR: Not authenticated - no userEmail in session');
      console.log('   Session keys:', Object.keys(req.session || {}));
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Validate price type
    if (!['monthly', 'annual'].includes(priceType)) {
      console.error(`❌ ERROR: Invalid price type: ${priceType}`);
      console.log('   Expected: monthly or annual');
      return res.status(400).json({ success: false, error: 'Invalid price type' });
    }

    // Map price types to Stripe price IDs
    const priceIds = {
      monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_1SMtjQF8aJ0BDqA3wHuGgeiD',
      annual: process.env.STRIPE_PRICE_ANNUAL || 'price_1SMtk0F8aJ0BDqA3llwpMIEf',
    };

    console.log('� Configuration Check:');
    console.log('   STRIPE_PRICE_MONTHLY env:', !!process.env.STRIPE_PRICE_MONTHLY);
    console.log('   STRIPE_PRICE_ANNUAL env:', !!process.env.STRIPE_PRICE_ANNUAL);
    console.log('   Using price IDs:', {
      monthly: priceIds.monthly,
      annual: priceIds.annual,
      selected: priceIds[priceType]
    });

    const appUrl = process.env.APP_URL || 'http://localhost:8080';
    console.log('   APP_URL:', appUrl);

    // Check Stripe configuration
    if (!stripe) {
      console.error('❌ ERROR: Stripe client not initialized');
      throw new Error('Stripe client not initialized');
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ ERROR: STRIPE_SECRET_KEY not configured');
      throw new Error('STRIPE_SECRET_KEY not configured');
    }

    console.log('📲 Step 1: Finding or creating Stripe customer...');

    // Create or get Stripe customer
    let customerId;
    try {
      console.log(`   Searching for existing customer with email: ${userEmail}`);
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      console.log(`   Found ${customers.data.length} customer(s)`);

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log(`   ✅ Using existing customer: ${customerId}`);
      } else {
        console.log('   Creating new Stripe customer...');
        const customer = await stripe.customers.create({ email: userEmail });
        customerId = customer.id;
        console.log(`   ✅ Created new customer: ${customerId}`);

        // Update user in database with Stripe customer ID
        try {
          console.log(`   Updating database with stripe_customer_id: ${customerId}`);
          await db.query('UPDATE users SET stripe_customer_id = $1 WHERE email = $2', [
            customerId,
            userEmail,
          ]);
          console.log('   ✅ Database updated');
        } catch (dbError) {
          console.warn('   ⚠️ Failed to update database with stripe_customer_id:', dbError.message);
          // Continue - this is not critical to checkout session creation
        }
      }
    } catch (stripeError) {
      console.error('❌ ERROR creating/finding Stripe customer:');
      console.error('   Message:', stripeError.message);
      console.error('   Code:', stripeError.code);
      console.error('   Status:', stripeError.status);
      console.error('   Full Error:', JSON.stringify(stripeError, Object.getOwnPropertyNames(stripeError), 2));
      throw stripeError;
    }

    // Create Stripe Checkout Session
    console.log('💳 Step 2: Creating Stripe checkout session...');
    console.log(`   Customer: ${customerId}`);
    console.log(`   Price: ${priceIds[priceType]}`);
    console.log(`   Type: ${priceType}`);
    console.log(`   Success URL: ${appUrl}/chat.html?session_id={CHECKOUT_SESSION_ID}`);
    console.log(`   Cancel URL: ${appUrl}/subscribe.html`);

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceIds[priceType],
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${appUrl}/chat.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/subscribe.html`,
        billing_address_collection: 'auto',
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ CHECKOUT SESSION CREATED SUCCESSFULLY');
      console.log('   Session ID:', session.id);
      console.log('   URL:', session.url);
      console.log('   Customer:', session.customer);
      console.log('   Amount Total:', session.amount_total);
      console.log('   Currency:', session.currency);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      res.json({ success: true, url: session.url, sessionId: session.id });
    } catch (stripeError) {
      console.error('❌ ERROR creating checkout session:');
      console.error('   Message:', stripeError.message);
      console.error('   Code:', stripeError.code);
      console.error('   Status:', stripeError.status);
      console.error('   Param:', stripeError.param);
      console.error('   Full Error:', JSON.stringify(stripeError, Object.getOwnPropertyNames(stripeError), 2));
      throw stripeError;
    }
  } catch (error) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ CHECKOUT SESSION CREATION FAILED');
    console.error('Error Message:', error.message);
    console.error('Error Name:', error.name);
    console.error('Error Code:', error.code);
    console.error('Error Status:', error.statusCode || error.status);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Log to Sentry if available
    if (Sentry) {
      Sentry.captureException(error, {
        tags: { component: 'checkout', action: 'create-session' },
        extra: { priceType: req.body.priceType, userEmail: req.session?.userEmail },
      });
    }

    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code,
      details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
    });
  }
});

/**
 * POST /api/create-portal-session
 * Creates a Stripe billing portal session for subscription management
 * Allows users to update payment method, view invoices, cancel subscription
 */
app.post('/api/create-portal-session', async (req, res) => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 PORTAL SESSION CREATION ATTEMPT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    const userEmail = req.session?.userEmail;
    
    console.log('📋 Request Details:');
    console.log('   User Email:', userEmail);
    console.log('   Session ID:', req.sessionID);

    // Validate authentication
    if (!userEmail) {
      console.error('❌ ERROR: Not authenticated - no userEmail in session');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Check Stripe configuration
    if (!stripe) {
      console.error('❌ ERROR: Stripe client not initialized');
      throw new Error('Stripe client not initialized');
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ ERROR: STRIPE_SECRET_KEY not configured');
      throw new Error('STRIPE_SECRET_KEY not configured');
    }

    console.log('📲 Step 1: Fetching user Stripe customer ID...');

    // Get user's Stripe customer ID from database
    try {
      const userResult = await db.query(
        'SELECT stripe_customer_id FROM users WHERE email = $1',
        [userEmail]
      );

      if (!userResult.rows[0]) {
        console.error('❌ ERROR: User not found:', userEmail);
        return res.status(404).json({ error: 'User not found' });
      }

      const stripeCustomerId = userResult.rows[0].stripe_customer_id;

      if (!stripeCustomerId) {
        console.warn('⚠️ WARNING: User has no Stripe customer ID');
        return res.status(400).json({ error: 'No subscription found. Please subscribe first.' });
      }

      console.log(`   ✅ Customer ID: ${stripeCustomerId}`);

      console.log('🔗 Step 2: Creating Stripe portal session...');
      const appUrl = process.env.APP_URL || 'https://app.veraneural.com';
      console.log(`   Return URL: ${appUrl}/chat.html`);

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${appUrl}/chat.html`,
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ PORTAL SESSION CREATED SUCCESSFULLY');
      console.log('   Portal URL:', portalSession.url);
      console.log('   Session ID:', portalSession.id);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      res.json({ url: portalSession.url });

    } catch (dbError) {
      console.error('❌ ERROR querying database:');
      console.error('   Message:', dbError.message);
      console.error('   Code:', dbError.code);
      throw dbError;
    }

  } catch (error) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ PORTAL SESSION CREATION FAILED');
    console.error('Error Message:', error.message);
    console.error('Error Name:', error.name);
    console.error('Error Code:', error.code);
    console.error('Error Status:', error.statusCode || error.status);
    
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Log to Sentry if available
    if (Sentry) {
      Sentry.captureException(error, {
        tags: { component: 'billing', action: 'portal-session' },
        extra: { userEmail: req.session?.userEmail },
      });
    }

    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
    });
  }
});

// ============================================
// ACCOUNT MANAGEMENT ENDPOINTS
// ============================================

/**
 * POST /api/update-name
 * Update user's name preference
 */
app.post('/api/update-name', async (req, res) => {
  try {
    if (!req.session?.userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { name } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid name provided' });
    }

    console.log('👤 UPDATE NAME');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Email:', req.session.userEmail);
    console.log('   New Name:', name);

    // Update user in database (if you add a name column)
    // For now, just log it
    // const result = await db.query('UPDATE users SET name = $1 WHERE email = $2', [name, req.session.userEmail]);
    
    console.log('✅ Name updated successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    res.json({ success: true, message: 'Name updated successfully' });
  } catch (error) {
    console.error('❌ Error updating name:', error);
    res.status(500).json({ error: 'Failed to update name' });
  }
});

/**
 * POST /api/update-preferences
 * Update user preferences (notifications, theme, etc)
 */
app.post('/api/update-preferences', async (req, res) => {
  try {
    if (!req.session?.userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { emailNotifications } = req.body;

    console.log('⚙️ UPDATE PREFERENCES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Email:', req.session.userEmail);
    console.log('   Email Notifications:', emailNotifications);

    // Update preferences in database (if you add preferences table)
    // For now, just log it
    // const result = await db.query('UPDATE user_preferences SET email_notifications = $1 WHERE email = $2', [emailNotifications, req.session.userEmail]);
    
    console.log('✅ Preferences updated successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    res.json({ success: true, message: 'Preferences updated' });
  } catch (error) {
    console.error('❌ Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * GET /api/download-data
 * Download all user conversations as JSON
 */
app.get('/api/download-data', async (req, res) => {
  try {
    if (!req.session?.userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log('📥 DOWNLOAD DATA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Email:', req.session.userEmail);

    // Fetch all conversations for the user
    const result = await db.query(
      'SELECT * FROM conversations WHERE user_email = $1 ORDER BY updated_at DESC',
      [req.session.userEmail]
    );

    const conversations = result.rows;
    console.log('   Conversations found:', conversations.length);

    // Build data object
    const userData = {
      email: req.session.userEmail,
      exportedAt: new Date().toISOString(),
      conversationCount: conversations.length,
      conversations: conversations
    };

    console.log('✅ Data prepared for download');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="vera-data-${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(userData, null, 2));

  } catch (error) {
    console.error('❌ Error downloading data:', error);
    res.status(500).json({ error: 'Failed to download data' });
  }
});

/**
 * POST /api/delete-history
 * Delete all conversations for the user
 */
app.post('/api/delete-history', async (req, res) => {
  try {
    if (!req.session?.userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log('🗑️ DELETE HISTORY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Email:', req.session.userEmail);

    // Delete all conversations for this user
    const result = await db.query(
      'DELETE FROM conversations WHERE user_email = $1',
      [req.session.userEmail]
    );

    console.log('   Deleted conversations:', result.rowCount);
    console.log('✅ Conversation history deleted');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    res.json({ success: true, message: 'Conversation history deleted', deletedCount: result.rowCount });

  } catch (error) {
    console.error('❌ Error deleting history:', error);
    res.status(500).json({ error: 'Failed to delete conversation history' });
  }
});

/**
 * POST /api/account/delete
 * Permanently delete user account, cancel subscription, and delete all data
 * Requires confirmation and optional password
 */
app.post('/api/account/delete', async (req, res) => {
  try {
    if (!req.session?.userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userEmail = req.session.userEmail;

    console.log('❌ DELETE ACCOUNT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Email:', userEmail);
    console.log('   Action: Permanently deleting account');

    // Fetch user to get Stripe customer ID
    const userResult = await db.query(
      'SELECT stripe_customer_id FROM users WHERE email = $1',
      [userEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const stripeCustomerId = user.stripe_customer_id;

    // Cancel Stripe subscription if exists
    if (stripeCustomerId) {
      console.log('   Stripe Customer ID:', stripeCustomerId);
      
      try {
        // Get customer subscriptions
        const subscriptions = await stripe.subscriptions.list({
          customer: stripeCustomerId,
          limit: 100
        });

        console.log('   Found subscriptions:', subscriptions.data.length);

        // Cancel all active subscriptions
        for (const subscription of subscriptions.data) {
          if (subscription.status !== 'canceled') {
            await stripe.subscriptions.cancel(subscription.id);
            console.log('   ✓ Cancelled subscription:', subscription.id);
          }
        }
      } catch (stripeError) {
        console.error('   ⚠️ Warning canceling Stripe subscriptions:', stripeError.message);
        // Continue with account deletion even if Stripe fails
      }
    }

    // Delete all conversations
    const convResult = await db.query(
      'DELETE FROM conversations WHERE user_email = $1',
      [userEmail]
    );
    console.log('   Deleted conversations:', convResult.rowCount);

    // Delete all email logs
    const emailResult = await db.query(
      'DELETE FROM email_logs WHERE recipient_email = $1',
      [userEmail]
    );
    console.log('   Deleted email logs:', emailResult.rowCount);

    // Delete user account
    const deleteResult = await db.query(
      'DELETE FROM users WHERE email = $1',
      [userEmail]
    );
    console.log('   Deleted user:', deleteResult.rowCount);

    console.log('✅ Account permanently deleted');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Clear session
    req.session.destroy((err) => {
      if (err) {
        console.error('⚠️ Error destroying session:', err);
      }
      res.json({ success: true, message: 'Account permanently deleted' });
    });

  } catch (error) {
    console.error('❌ Error deleting account:', error);
    console.error('   Details:', error.message);
    res.status(500).json({ 
      error: 'Failed to delete account',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/stripe-webhook
 * Handles Stripe webhook events
 * Verifies signature and processes subscription events
 */
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('⚠️ STRIPE_WEBHOOK_SECRET not configured');
    return res.sendStatus(400);
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(`📨 Webhook event: ${event.type}`);
  } catch (error) {
    console.error('❌ Webhook signature verification failed:', error.message);
    return res.sendStatus(400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log(`✅ Checkout session completed: ${session.id}`);
        console.log(`   Customer: ${session.customer}, Email: ${session.customer_email}`);

        // Update user subscription status
        await db.query(
          `UPDATE users 
           SET subscription_status = $1, 
               stripe_customer_id = $2, 
               stripe_subscription_id = $3,
               updated_at = NOW()
           WHERE email = $4`,
          ['active', session.customer, session.subscription || null, session.customer_email]
        );

        console.log(`✅ User subscription activated: ${session.customer_email}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log(`❌ Subscription cancelled: ${subscription.id}`);

        // Get customer email and update user
        const customer = await stripe.customers.retrieve(subscription.customer);
        await db.query(
          `UPDATE users 
           SET subscription_status = $1, 
               updated_at = NOW()
           WHERE email = $2`,
          ['free_tier', customer.email]
        );

        console.log(`✅ User downgraded to free tier: ${customer.email}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log(`⚠️ Payment failed for invoice: ${invoice.id}`);
        // Could send email notification here
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log(`📝 Subscription updated: ${subscription.id}, status: ${subscription.status}`);
        break;
      }

      default:
        console.log(`⏭️ Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    // Still return 200 to prevent Stripe from retrying
  }

  res.sendStatus(200);
});

// ==================== EMAIL DELIVERY MONITORING (ADMIN) ====================

// Get email delivery stats for last 24 hours
app.get('/api/admin/email-stats', async (req, res) => {
  try {
    // SECURITY: Check admin - customize ADMIN_EMAIL in your .env
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || req.session.userEmail !== adminEmail) {
      return res.status(403).json({ error: 'Unauthorized - Admin access required' });
    }

    const stats = await db.query(
      `SELECT 
        COUNT(*) as total_emails,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        ROUND(100.0 * COUNT(CASE WHEN status = 'sent' THEN 1 END) / NULLIF(COUNT(*), 0), 2) as success_rate,
        MAX(sent_at) as last_successful_send,
        COUNT(DISTINCT email_address) as unique_recipients
      FROM email_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'`
    ).catch(() => ({ rows: [{ total_emails: 0, error: 'email_logs table not created yet' }] }));

    const recentFailures = await db.query(
      `SELECT id, email_address, subject, email_type, error_message, attempt_count, last_attempted, created_at
       FROM email_logs
       WHERE status = 'failed'
       ORDER BY last_attempted DESC
       LIMIT 20`
    ).catch(() => ({ rows: [] }));

    res.json({
      stats: stats.rows[0],
      recentFailures: recentFailures.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Email stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed email log for a specific user
app.get('/api/admin/email-log/:email', async (req, res) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || req.session.userEmail !== adminEmail) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const userEmail = req.params.email;
    const logs = await db.query(
      `SELECT id, email_address, subject, email_type, status, error_message, attempt_count, sent_at, created_at
       FROM email_logs 
       WHERE email_address = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userEmail]
    ).catch(() => ({ rows: [] }));

    const successCount = logs.rows.filter(l => l.status === 'sent').length;
    const failedCount = logs.rows.filter(l => l.status === 'failed').length;

    res.json({
      email: userEmail,
      logs: logs.rows,
      totalAttempts: logs.rows.length,
      successCount,
      failedCount,
      successRate: logs.rows.length > 0 ? ((successCount / logs.rows.length) * 100).toFixed(1) + '%' : 'N/A',
    });
  } catch (error) {
    console.error('❌ Email log error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual retry for a specific failed email
app.post('/api/admin/email-retry/:logId', async (req, res) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || req.session.userEmail !== adminEmail) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const logId = req.params.logId;
    
    const emailLog = await db.query(
      `SELECT id, email_address, subject FROM email_logs WHERE id = $1`,
      [logId]
    ).catch(() => ({ rows: [] }));

    if (emailLog.rows.length === 0) {
      return res.status(404).json({ error: 'Email log not found' });
    }

    const email = emailLog.rows[0];

    // Attempt retry
    try {
      const result = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'vera@revolutionary-production.up.railway.app',
        to: email.email_address,
        subject: email.subject,
        html: `<p>This is a retry of your previous email.</p><p>Original subject: ${email.subject}</p>`,
      });

      await db.query(
        `UPDATE email_logs SET status = $1, resend_id = $2, sent_at = NOW(), updated_at = NOW() WHERE id = $3`,
        ['sent', result.id, logId]
      ).catch(() => null);

      res.json({ success: true, message: 'Email retry initiated', resendId: result.id });
    } catch (sendError) {
      await db.query(
        `UPDATE email_logs SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
        ['failed', sendError.message, logId]
      ).catch(() => null);

      res.status(500).json({ error: sendError.message });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// ==================== TEST ENDPOINT - RESEND ====================
app.get('/api/test-resend', async (req, res) => {
  console.log('🧪 Direct Resend API test initiated...');
  
  try {
    console.log('📋 Test configuration:', {
      from: process.env.EMAIL_FROM,
      apiKeySet: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) + '...',
      resendClientExists: !!resend,
      timestamp: new Date().toISOString()
    });
    
    console.log('📤 Sending test email via Resend...');
    
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'VERA <support@veraneural.com>',
      to: 'support@veraneural.com',
      subject: 'VERA Resend Test - ' + new Date().toISOString(),
      html: `
        <h1>✅ Resend Test Successful</h1>
        <p>This email confirms that Resend is working correctly.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>From:</strong> ${process.env.EMAIL_FROM}</p>
      `
    });
    
    console.log('✅ Test email sent successfully:', {
      id: result.id,
      fullResponse: JSON.stringify(result, null, 2)
    });
    
    res.json({ 
      success: true, 
      message: 'Test email sent successfully!',
      resendId: result.id,
      result: result 
    });
    
  } catch (error) {
    console.error('❌ Resend test failed - FULL ERROR:', {
      message: error.message,
      name: error.name,
      code: error.code,
      statusCode: error.statusCode,
      cause: error.cause,
      response: error.response,
      stack: error.stack,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    });
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      errorType: error.name,
      details: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode
      }
    });
  }
});

// ==================== EXPORT FOR SERVERLESS ====================
// ==================== ERROR HANDLER (Must be LAST middleware!) ====================
// Sentry error handler (must come after all other middleware and routes)
app.use(Sentry.Handlers.errorHandler());
app.use(errorHandler.middleware());
module.exports = app;

// ==================== START SERVER ====================
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    // Start automated tasks
    sessionCleaner.start();
    logger.info('🧹 Session cleanup scheduler started');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌟 VERA REVOLUTIONARY SYSTEM ONLINE 🌟');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✨ Server listening on port ${PORT}`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log(
      `🌐 Public URL: ${process.env.APP_URL || '(set APP_URL to your domain or Railway URL)'}`
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('"Not an AI pretending to be human,');
    console.log(' but a revolutionary intelligence');
    console.log(' built for your body."');
    console.log('');
    console.log('API Endpoints Active:');
    console.log('  • POST /api/auth/login       (with bcrypt)');
    console.log('  • POST /api/auth/signup      (with bcrypt)');
    console.log('  • POST /api/auth/logout');
    console.log('  • GET  /health');
    console.log('  • GET  /api/auth/check');
    console.log('  • POST /api/auth/send-magic-link  (passwordless)');
    console.log('  • GET  /verify-magic-link         (token verification)');
    console.log('  • POST /api/request-magic-link    (chat re-auth)');
    console.log('  • GET  /api/test-resend           (diagnostic)');
    console.log('  • POST /api/chat');
    console.log('  •');
    console.log('  • POST /api/history');
    console.log('  •');
    console.log('  • POST /api/export');
    console.log('  •');
    console.log('  • POST /api/delete-data');
    console.log('  •');
    console.log('  • POST /api/check-history');
    console.log('  • GET  /api/db-health');
    console.log('');
    console.log('🎯 Ready to revolutionize nervous system awareness');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}
