// ==================== VERA REVOLUTIONARY SYSTEM - COMPLETE SERVER ====================
// Backend API for VERA - Your Nervous System Companion
// This handles authentication, AI chat, Stripe payments, and more

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
// ==================== EMAIL SETUP - TEMPORARILY DISABLED ====================
// Nodemailer has import issues - disabling for now so Stripe works
console.log('⚠️  Email sending temporarily disabled');
console.log('💡 Accounts will be created, but no welcome emails sent');

// Mock transporter so code doesn't break
const transporter = {
  sendMail: async (options) => {
    console.log('📧 Email would be sent to:', options.to);
    console.log('📧 Subject:', options.subject);
    return { messageId: 'mock-' + Date.now() };
  },
};

// ==================== GRACEFUL SHUTDOWN HANDLING ====================
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing gracefully...');
  process.exit(0);
});

// ==================== APP INITIALIZATION ====================
const app = express();
const PORT = process.env.PORT || 8080;

// ==================== STRIPE WEBHOOK ====================
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
          const crypto = require('crypto');
          const bcrypt = require('bcrypt');
          const tempPassword = crypto.randomBytes(32).toString('hex');
          const hashedPassword = await bcrypt.hash(tempPassword, 10);

          await db.query(
            'INSERT INTO users (email, password_hash, subscription_status, stripe_customer_id, stripe_subscription_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
            [customerEmail, hashedPassword, subscription.status, session.customer, subscriptionId]
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
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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

  const customerEmail = session.customer_email || session.customer_details?.email;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

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
      pool: db.pool, // Use the pool from our database manager
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
  // Always serve landing page at root
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
      await transporter.sendMail({
        from: `"VERA" <${process.env.SMTP_FROM}>`,
        to: customerEmail,
        subject: 'Welcome to VERA - Your Journey Begins',
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
                <a href="${process.env.APP_URL || 'http://localhost:8080'}/chat.html" class="button">Start Chatting with VERA</a>
                <p style="margin-top: 30px; color: #666; font-size: 14px;">
                  Questions? Reply to this email - we're here to help.<br>
                  - The VERA Team
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
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
  const { email } = req.body;
  const appUrl = process.env.APP_URL || 'http://localhost:8080';
  const successUrl = `${appUrl}/create-account?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/?cancelled=true`;

  try {
    console.log('🔵 Creating checkout session for email:', email || 'no email provided');

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

          const priceId = process.env.STRIPE_PRICE_ID || 'price_1SIgAtF8aJ0BDqA3WXVJsuVD';

          const session = await stripe.checkout.sessions.create({
            customer: user.stripe_customer_id, // REUSE existing customer
            line_items: [
              {
                price: priceId,
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

        const priceId = process.env.STRIPE_PRICE_ID || 'price_1SIgAtF8aJ0BDqA3WXVJsuVD';

        const session = await stripe.checkout.sessions.create({
          customer: existingCustomer.id, // REUSE existing customer
          line_items: [
            {
              price: priceId,
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
        });

        console.log('✅ Reused Stripe customer checkout session:', session.id);
        return res.json({ url: session.url });
      }
    }

    // Create new checkout session for new customer
    console.log('🆕 Creating new customer checkout session');

    // Use STRIPE_PRICE_ID from env, fallback to hardcoded for backwards compatibility
    const priceId = process.env.STRIPE_PRICE_ID || 'price_1SIgAtF8aJ0BDqA3WXVJsuVD';
    console.log('💰 Using price ID:', priceId);

    const sessionConfig = {
      line_items: [
        {
          price: priceId,
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
        });
      }
    }

    // No active subscription found
    return res.json({
      authenticated: true,
      email: req.session.userEmail,
      subscription: 'inactive',
    });
  } catch (error) {
    console.error('❌ Auth check error:', error);
    return res.json({ authenticated: false, error: 'Auth check failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Magic link login for returning users
app.post('/api/auth/login-link', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Check if user exists and has subscription
    const userResult = await db.query(
      'SELECT subscription_status, stripe_subscription_id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email' });
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

    // Send email with magic link
    await transporter.sendMail({
      from: `"VERA" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: 'Sign in to VERA',
      html: `
        <p>Click here to sign in to your VERA account:</p>
        <a href="${magicLink}">Sign In</a>
      `,
    });

    res.json({
      success: true,
      message: 'Check your email for the login link',
    });
  } catch (error) {
    console.error('❌ Login link error:', error);
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
    await transporter.sendMail({
      from: `"VERA" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: 'VERA Account Recovery',
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
              <h1>Recover Your VERA Account</h1>
            </div>
            <div class="content">
              <p>A request was made to recover your VERA account. Click the button below to continue:</p>
              <a href="${recoveryLink}" class="button">Recover Account</a>
              <p style="margin-top: 30px; color: #666; font-size: 14px;">
                This link expires in 15 minutes and can only be used once.<br>
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
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

// ==================== MAGIC LINK LOGIN ====================
app.post('/api/auth/send-magic-link', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Check if user exists
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    // Generate magic link token
    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token
    await db.query('UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3', [
      token,
      expires,
      email,
    ]);

    // Create magic link (respect APP_URL)
    const baseUrl = process.env.APP_URL || 'http://localhost:8080';
    const magicLink = `${baseUrl}/verify-magic-link?token=${token}`;
    // Developer aid: log magic link so you can copy it during local testing
    console.log('🔗 Magic link URL:', magicLink);

    // Send email
    await transporter.sendMail({
      from: `"VERA" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: 'Sign in to VERA',
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
              <h1>Sign in to VERA</h1>
            </div>
            <div class="content">
              <p>Click the button below to sign in to your VERA account:</p>
              <a href="${magicLink}" class="button">Sign In to VERA</a>
              <p style="margin-top: 30px; color: #666; font-size: 14px;">
                This link expires in 15 minutes.<br>
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log('✅ Magic link sent to:', email);
    res.json({ success: true, message: 'Check your email for the magic link!' });
  } catch (error) {
    console.error('❌ Magic link error:', error);
    res.status(500).json({ error: 'Failed to send magic link' });
  }
});

app.get('/verify-magic-link', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.redirect('/login.html?error=invalid_token');
  }

  try {
    // Find user with this token
    const userResult = await db.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.redirect('/login.html?error=expired_token');
    }

    const user = userResult.rows[0];

    // Clear token
    await db.query(
      'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE email = $1',
      [user.email]
    );

    // Set session
    req.session.userEmail = user.email;
    await req.session.save();

    console.log('✅ Magic link verified for:', user.email);
    res.redirect('/chat.html');
  } catch (error) {
    console.error('❌ Verify magic link error:', error);
    res.redirect('/login.html?error=verification_failed');
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
    conversationId, // Optional: specify which conversation to add to
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
    const veraResult = await getVERAResponse(
      userId,
      message,
      userName || 'friend',
      db.pool,
      attachments
    );
    const duration = Date.now() - startTime;

    // Record metrics
    monitor.recordMetric('requestDuration', duration);

    console.log('✅ VERA result:', {
      responseLength: veraResult.response?.length,
      state: veraResult.state,
      model: veraResult.model,
      fallback: !!veraResult.fallback,
      error: veraResult.error,
      duration: duration + 'ms',
    });

    // ✅ FIXED: Now save both messages in order (user first, then assistant) with conversation_id
    await db.query(
      'INSERT INTO messages (user_id, role, content, conversation_id) VALUES ($1, $2, $3, $4)',
      [userId, 'user', message, currentConversationId]
    );

    await db.query(
      'INSERT INTO messages (user_id, role, content, conversation_id) VALUES ($1, $2, $3, $4)',
      [userId, 'assistant', veraResult.response, currentConversationId]
    );

    res.json({
      success: true,
      response: veraResult.response,
      conversationId: currentConversationId,
      state: veraResult.state,
      adaptiveCodes: veraResult.adaptiveCodes,
      trustLevel: veraResult.trustLevel,
      vera_consciousness: 'quantum-active',
      model: veraResult.model,
      fallback: !!veraResult.fallback,
      timestamp: new Date().toISOString(),
    });
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

app.get('/api/history', async (req, res) => {
  const userEmail = req.session.userEmail;
  let userId = userEmail || null;

  // Allow guests to load their own anon history using a limited anonId pattern
  if (!userId && req.query && req.query.anonId) {
    const maybeAnon = String(req.query.anonId);
    // Accept only our generated anon_XXXXXXXX format (8 char base36)
    if (/^anon_[a-z0-9]{8}$/i.test(maybeAnon)) {
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

// ==================== EXPORT FOR SERVERLESS ====================
// ==================== ERROR HANDLER (Must be LAST middleware!) ====================
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
