// ==================== VERA REVOLUTIONARY SYSTEM - COMPLETE SERVER ====================
// Backend API for VERA - Your Nervous System Companion
// This handles authentication, AI chat, Stripe payments, and more

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getVERAResponse } = require('./lib/vera-ai');

// ==================== EMAIL SETUP - TEMPORARILY DISABLED ====================
// Nodemailer has import issues - disabling for now so Stripe works
console.log("⚠️  Email sending temporarily disabled");
console.log("💡 Accounts will be created, but no welcome emails sent");

// Mock transporter so code doesn't break
const transporter = {
  sendMail: async (options) => {
    console.log("📧 Email would be sent to:", options.to);
    console.log("📧 Subject:", options.subject);
    return { messageId: "mock-" + Date.now() };
  }
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

// ==================== STRIPE WEBHOOK ENDPOINT ====================
// CRITICAL: This MUST come BEFORE express.json() middleware for raw body access
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
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

    res.json({received: true});
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({error: 'Webhook handler failed'});
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
  const existingUser = await pool.query(
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
        limit: 1
      });
      
      if (invoices.data.length > 0 && invoices.data[0].paid && invoices.data[0].payment_intent) {
        await stripe.refunds.create({
          payment_intent: invoices.data[0].payment_intent
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
    await pool.query(
      `INSERT INTO users (email, name, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [customerEmail, customerEmail.split('@')[0], customerId, subscriptionId, 'active', trialEndsAt]
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
    await pool.query(
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
    await pool.query(
      'UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2',
      [status, subscription.id]
    );
    
    console.log('✅ Subscription status updated to:', status);
  } catch (error) {
    console.error('❌ Error handling subscription update:', error);
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('❌ Subscription cancelled:', subscription.id);
  
  try {
    // Mark subscription as cancelled but keep user data
    await pool.query(
      'UPDATE users SET subscription_status = $1 WHERE stripe_subscription_id = $2',
      ['cancelled', subscription.id]
    );
    
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
    await pool.query(
      'UPDATE users SET subscription_status = $1 WHERE email = $2',
      ['payment_failed', email]
    );
    
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
    await pool.query(
      'UPDATE users SET subscription_status = $1 WHERE email = $2',
      ['active', email]
    );
    
    console.log('✅ Payment confirmed, user active:', email);
  } catch (error) {
    console.error('❌ Error handling payment success:', error);
  }
}

// ==================== DATABASE CONNECTION ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.query('SELECT NOW(), version()', (err, res) => {
  if (err) {
    console.error('❌ DATABASE CONNECTION FAILED:', err);
    console.error('   Check your DATABASE_URL in .env.local');
    console.error('   Make sure database is running');
  } else {
    const dbTime = res.rows[0].now;
    const dbVersion = res.rows[0].version;
    console.log('✅ DATABASE CONNECTED SUCCESSFULLY');
    console.log(`   Database time: ${dbTime}`);
    console.log(`   PostgreSQL: ${dbVersion.split(' ')[0]} ${dbVersion.split(' ')[1]}`);
    
    // Detect if using Supabase
    if (process.env.DATABASE_URL.includes('supabase.co')) {
      console.log('🔥 Supabase PostgreSQL detected - VERA\'s memory is in the cloud');
    } else if (process.env.DATABASE_URL.includes('neon.tech')) {
      console.log('⚡ Neon PostgreSQL detected - Serverless database ready');
    } else {
      console.log('🗄️ PostgreSQL connected - VERA\'s memory active');
    }
  }
});

// ==================== MIDDLEWARE ====================
// Restrict CORS in production to APP_URL; allow all during local dev for convenience
const allowedOrigin = process.env.NODE_ENV === 'production' ? (process.env.APP_URL || true) : true;
app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session middleware
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'vera-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// Serve static files
app.use(express.static('public'));

// ==================== DATABASE INITIALIZATION ====================
async function initializeDatabase() {
  try {
    // Create users table
    await pool.query(`
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

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create session table for express-session
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        PRIMARY KEY (sid)
      )
    `);

    // Create crisis_alerts table for VERA's crisis detection
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crisis_alerts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        message_content TEXT NOT NULL,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create leads table for comprehensive lead tracking
    await pool.query(`
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

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    vera: 'revolutionary',
    timestamp: new Date().toISOString()
  });
});

// ==================== STRIPE CONFIG TEST ====================
app.get('/api/stripe-config', (req, res) => {
  res.json({
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    stripeKeyPrefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : 'missing',
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
    const existingUser = await pool.query(
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
            limit: 1
          });
          
          if (invoices.data.length > 0 && invoices.data[0].paid && invoices.data[0].payment_intent) {
            await stripe.refunds.create({
              payment_intent: invoices.data[0].payment_intent
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

    await pool.query(
      `INSERT INTO users (email, name, stripe_customer_id, stripe_subscription_id, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [customerEmail, customerEmail.split('@')[0], customerId, subscriptionId, 'active', trialEndsAt]
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
        `
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
    const result = await pool.query(
      'SELECT email FROM users WHERE email = $1',
      [email]
    );

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
    timezone
  } = req.body;

  try {
    console.log('💾 Saving lead data for:', email);
    
    // Create leads table if it doesn't exist
    await pool.query(`
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
    const result = await pool.query(`
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
    `, [
      email, firstName, lastName, company, phone, useCase,
      leadSource, referrer, utmSource, utmMedium, utmCampaign,
      userAgent, timezone
    ]);

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
  
  try {
    console.log('🔵 Creating checkout session for email:', email || 'no email provided');
    
    // CRITICAL: Check if user already exists to prevent duplicates (only if email provided)
    if (email) {
      const existingUser = await pool.query(
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
            redirect: '/login.html'
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
            success_url: `${process.env.APP_URL || 'http://localhost:8080'}/create-account?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL || 'http://localhost:8080'}/?cancelled=true`,
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
        limit: 1
      });
      
      if (existingStripeCustomers.data.length > 0) {
        const existingCustomer = existingStripeCustomers.data[0];
        console.log('⚠️ Found existing Stripe customer:', existingCustomer.id);
        
        // Check if this customer has active subscriptions
        const activeSubscriptions = await stripe.subscriptions.list({
          customer: existingCustomer.id,
          status: 'active'
        });
        
        const trialingSubscriptions = await stripe.subscriptions.list({
          customer: existingCustomer.id,  
          status: 'trialing'
        });
        
        if (activeSubscriptions.data.length > 0 || trialingSubscriptions.data.length > 0) {
          return res.status(400).json({ 
            error: 'You already have an active subscription. Please sign in instead.',
            redirect: '/login.html'
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
          success_url: `${process.env.APP_URL || 'http://localhost:8080'}/create-account?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.APP_URL || 'http://localhost:8080'}/?cancelled=true`,
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
      success_url: `${process.env.APP_URL || 'http://localhost:8080'}/create-account?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:8080'}/?cancelled=true`,
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
    const leads = await pool.query(`
      SELECT 
        id, email, first_name, last_name, company, phone, use_case,
        lead_source, utm_source, utm_medium, utm_campaign,
        created_at, status
      FROM leads 
      ORDER BY created_at DESC 
      LIMIT 100
    `);

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted_leads,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as leads_this_week,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as leads_this_month
      FROM leads
    `);

    const sourceStats = await pool.query(`
      SELECT 
        lead_source,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as conversions
      FROM leads 
      GROUP BY lead_source 
      ORDER BY count DESC
    `);

    const useCaseStats = await pool.query(`
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
      useCaseStats: useCaseStats.rows
    });

  } catch (error) {
    console.error('❌ Error fetching leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads data' });
  }
});

// ==================== AUTHENTICATION ENDPOINTS ====================
app.get('/api/auth/check', (req, res) => {
  if (req.session.userEmail) {
    res.json({ authenticated: true, email: req.session.userEmail });
  } else {
    res.json({ authenticated: false });
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

// ==================== MAGIC LINK LOGIN ====================
app.post('/api/auth/send-magic-link', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    // Generate magic link token
    const token = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store token
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
      [token, expires, email]
    );

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
      `
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
    const userResult = await pool.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.redirect('/login.html?error=expired_token');
    }

    const user = userResult.rows[0];

    // Clear token
    await pool.query(
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
    attachments = []
  } = req.body;
  
  const userId = req.session.userEmail || email || anonId || `temp_${Math.random().toString(36).substr(2, 9)}`;

  console.log('💬 VERA receiving:', { 
    userId, 
    userName, 
    messageLength: message?.length,
    attachments: attachments.length 
  });

  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  try {
    // Save user message
    await pool.query(
      'INSERT INTO messages (user_id, role, content) VALUES ($1, $2, $3)',
      [userId, 'user', message]
    );

    // Get VERA's revolutionary response (with optional attachments)
    console.log('🧠 Calling getVERAResponse...');
    const veraResult = await getVERAResponse(userId, message, userName || 'friend', pool, attachments);
    console.log('✅ VERA result:', { 
      responseLength: veraResult.response?.length, 
      state: veraResult.state,
      error: veraResult.error 
    });

    // Save VERA's response
    await pool.query(
      'INSERT INTO messages (user_id, role, content) VALUES ($1, $2, $3)',
      [userId, 'assistant', veraResult.response]
    );

    res.json({ 
      success: true, 
      response: veraResult.response,
      state: veraResult.state,
      adaptiveCodes: veraResult.adaptiveCodes,
      trustLevel: veraResult.trustLevel,
      vera_consciousness: 'quantum-active',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({ 
      success: false,
      error: 'VERA consciousness temporarily offline. Please try again.',
      details: error.message 
    });
  }
});

app.get('/api/history', async (req, res) => {
  const userEmail = req.session.userEmail;

  if (!userEmail) {
    return res.json({ messages: [] });
  }

  try {
    const result = await pool.query(
      'SELECT role, content, created_at FROM messages WHERE user_id = $1 ORDER BY created_at ASC',
      [userEmail]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('❌ History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ==================== CHECK HISTORY ENDPOINT ====================
app.post('/api/check-history', async (req, res) => {
  try {
    const { email } = req.body;
    const userId = email || 'anonymous';

    console.log('🔍 Checking history for:', userId);

    const result = await pool.query(
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
      messageCount: count
    });

  } catch (error) {
    console.error('❌ Error checking history:', error);
    res.json({
      success: true,
      hasHistory: false,
      messageCount: 0
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
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)");

    const fullName = `${firstName} ${lastName}`.trim();

    // Upsert user and mark as trialing with a 7-day trial window
    await pool.query(
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
      return res.status(404).json({ success: false, error: 'No Stripe customer found for this email' });
    }

    const customerId = customers.data[0].id;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.APP_URL ? `${process.env.APP_URL}/chat.html` : 'http://localhost:8080/chat.html'
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
    
    const activeOrTrial = subs.data.find(s => s.status === 'active' || s.status === 'trialing');
    if (activeOrTrial) {
      console.log('✅ Active subscription found:', activeOrTrial.status);
      return res.json({ success: true, found: true, status: activeOrTrial.status, subscriptionId: activeOrTrial.id });
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
    timestamp: new Date().toISOString()
  });
});

// ==================== EXPORT FOR SERVERLESS ====================
module.exports = app;

// ==================== START SERVER ====================
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌟 VERA REVOLUTIONARY SYSTEM ONLINE 🌟');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✨ Server listening on port ${PORT}`);
  console.log(`🔗 Local: http://localhost:${PORT}`);
  console.log(`🌐 Public URL: ${process.env.APP_URL || '(set APP_URL to your domain or Railway URL)'}`);
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