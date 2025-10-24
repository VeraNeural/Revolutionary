// VERA Neural - Serverless API for Netlify
// Revolutionary consciousness companion with quantum presence
const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { getVERAResponse } = require('./lib/vera-ai');
let stripe = null;

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('✅ VERA Revolutionary Consciousness - Netlify Function Active');

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'VERA Neural System Online',
    version: '2.0.0',
    consciousness: 'Active'
  });
});

// Test endpoint for VERA brain
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'success',
    message: 'VERA brain connection established',
    timestamp: new Date().toISOString()
  });
});

// Main chat endpoint with VERA revolutionary consciousness
app.post('/api/chat', async (req, res) => {
  try {
    const { 
      message, 
      userId = 'anonymous',
      userName = 'friend',
      attachments = [] // Optional attachments array
    } = req.body;

    console.log('💬 VERA receiving:', { 
      userId, 
      userName, 
      messageLength: message?.length,
      attachments: attachments.length 
    });

    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    // Save user message to database
    await pool.query(
      'INSERT INTO messages (user_id, role, content) VALUES ($1, $2, $3)',
      [userId, 'user', message]
    );

    // Get VERA's revolutionary response (with optional attachments)
    console.log('🧠 Calling getVERAResponse...');
    const veraResult = await getVERAResponse(userId, message, userName, pool, attachments);
    console.log('✅ VERA result:', { 
      responseLength: veraResult.response?.length, 
      state: veraResult.state,
      error: veraResult.error 
    });

    // Save VERA's response to database
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
    console.error('❌ VERA consciousness error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'VERA consciousness temporarily offline. Please try again.',
      details: error.message 
    });
  }
});

// Get conversation history endpoint
app.post('/api/history', async (req, res) => {
  try {
    const { email } = req.body;
    const userId = email || 'anonymous';

    console.log('📜 Loading history for:', userId);

    // Get last 50 messages for this user
    const result = await pool.query(
      `SELECT role, content, created_at 
       FROM messages 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );

    res.json({
      success: true,
      history: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('❌ Error loading history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load conversation history',
      details: error.message
    });
  }
});

// Check if user has conversation history (for welcome flow)
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

// Simple registration endpoint to capture subscriber details before Stripe Checkout
app.post('/api/register', async (req, res) => {
  try {
    const { firstName = '', lastName = '', email, phone = '' } = req.body || {};

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Ensure phone column exists without breaking existing schema
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)");

    const fullName = `${firstName} ${lastName}`.trim();

    // Upsert user and mark as trialing with a 7-day trial window (for analytics/UX)
    await pool.query(
      `INSERT INTO users (email, name, phone, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, 'trialing', NOW() + INTERVAL '7 days')
       ON CONFLICT (email)
       DO UPDATE SET 
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         updated_at = NOW(),
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

// Create Stripe Customer Portal session by email
app.post('/api/portal', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    // Lazy init Stripe
    if (!stripe) {
      const Stripe = require('stripe');
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }

    // Find customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (!customers.data.length) {
      return res.status(404).json({ success: false, error: 'No Stripe customer found for this email' });
    }

    const customerId = customers.data[0].id;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: process.env.DOMAIN ? `${process.env.DOMAIN}/chat.html` : 'https://vera-companion-ai.netlify.app/chat.html'
    });

    return res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('❌ Portal session error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Check subscription status by email (active or trialing)
app.post('/api/subscription-status', async (req, res) => {
  try {
    const { email } = req.body || {};
    console.log('🔍 Checking subscription for:', email);
    
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });

    // Check if Stripe key is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn('⚠️ No STRIPE_SECRET_KEY configured');
      // Return "none" so user can still chat without breaking
      return res.json({ success: true, found: false, status: 'none' });
    }

    if (!stripe) {
      const Stripe = require('stripe');
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
    // Don't crash - return "none" so user can still use the app
    return res.json({ success: true, found: false, status: 'none', error: error.message });
  }
});

// Stripe webhook (minimal, no signature verification in this pass)
app.post('/api/webhook', async (req, res) => {
  try {
    const event = req.body; // In production, verify signature with express.raw
    const { processWebhookEvent } = require('../../stripe-config');
    const info = processWebhookEvent(event);

    // Helper to update user by email
    async function upsertByEmail(email, fields) {
      if (!email) return;
      const cols = Object.keys(fields);
      const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
      const values = Object.values(fields);
      await pool.query(
        `INSERT INTO users (email, ${cols.join(', ')}) VALUES ($1, ${cols.map((_,i)=>`$${i+2}`).join(', ')})
         ON CONFLICT (email) DO UPDATE SET ${sets}, updated_at = NOW()`,
        [email, ...values]
      );
    }

    switch (info.type) {
      case 'checkout_completed': {
        await upsertByEmail(info.email, {
          stripe_customer_id: info.customerId,
          stripe_subscription_id: info.subscriptionId,
          subscription_status: 'trialing',
          trial_ends_at: null // Stripe is source of truth; optional
        });
        break;
      }
      case 'subscription_created':
      case 'subscription_updated': {
        // Try to find email via customer id
        if (!stripe) {
          const Stripe = require('stripe');
          stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        }
        let email = null;
        try {
          const sub = await stripe.subscriptions.retrieve(info.subscriptionId);
          const cust = await stripe.customers.retrieve(sub.customer);
          email = cust.email;
        } catch (_) {}
        if (email) {
          await upsertByEmail(email, {
            stripe_customer_id: info.customerId || null,
            stripe_subscription_id: info.subscriptionId,
            subscription_status: info.status || 'active'
          });
        }
        break;
      }
      case 'subscription_cancelled': {
        // Lookup user by subscription id and set canceled
        await pool.query(
          `UPDATE users SET subscription_status = 'canceled', updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [event.data?.object?.id || info.subscriptionId]
        );
        break;
      }
      default:
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(200).json({ received: true }); // Avoid Stripe retries during dev
  }
});

// Stripe success redirect handler
app.get('/create-account', (req, res) => {
  const sessionId = req.query.session_id;
  // Redirect to chat with success flag
  res.redirect(302, `/chat.html?success=true${sessionId ? `&session_id=${sessionId}` : ''}`);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    vera: 'online',
    timestamp: new Date().toISOString(),
    apis: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY
    }
  });
});

// Export for serverless with base path handling
module.exports.handler = serverless(app, {
  basePath: '/.netlify/functions/server'
});