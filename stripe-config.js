// stripe-config.js
// VERA Neural - Simple, Bulletproof Stripe Integration
// ONE TIER: $19/month with 7-day free trial

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ==================== CONFIGURATION ====================
const VERA_SUBSCRIPTION_CONFIG = {
  priceId: process.env.STRIPE_PRICE_ID, // Your $19/month price ID from Stripe
  trialDays: 7,
  currency: 'usd',
  amount: 1900, // $19.00 in cents
};

// ==================== CREATE CHECKOUT SESSION ====================
async function createCheckoutSession(userEmail, userName) {
  try {
    console.log('🎫 Creating checkout session for:', userEmail);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      
      // Customer info
      customer_email: userEmail,
      client_reference_id: userEmail, // Extra safety - track by email
      
      // Subscription configuration
      line_items: [
        {
          price: VERA_SUBSCRIPTION_CONFIG.priceId,
          quantity: 1,
        },
      ],
      
      // 7-day free trial
      subscription_data: {
        trial_period_days: VERA_SUBSCRIPTION_CONFIG.trialDays,
        metadata: {
          user_email: userEmail,
          user_name: userName || 'VERA User',
          created_via: 'vera_chat',
        },
      },
      
      // Where to send user after payment
      success_url: `${process.env.DOMAIN}/chat.html?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.DOMAIN}/chat.html?cancelled=true`,
      
      // Metadata for tracking
      metadata: {
        user_email: userEmail,
        user_name: userName || '',
      },
    });

    console.log('✅ Checkout session created:', session.id);
    return {
      success: true,
      sessionId: session.id,
      url: session.url,
    };

  } catch (error) {
    console.error('❌ Stripe checkout error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ==================== VERIFY SESSION ====================
// Check if a checkout session was successful
async function verifyCheckoutSession(sessionId) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    return {
      success: true,
      paid: session.payment_status === 'paid',
      email: session.customer_email || session.customer_details?.email,
      customerId: session.customer,
      subscriptionId: session.subscription,
    };
  } catch (error) {
    console.error('❌ Session verification error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ==================== CHECK SUBSCRIPTION STATUS ====================
// Verify if a user has an active subscription
async function checkSubscriptionStatus(customerIdOrEmail) {
  try {
    let customerId = customerIdOrEmail;
    
    // If email provided, find customer first
    if (customerIdOrEmail.includes('@')) {
      const customers = await stripe.customers.list({
        email: customerIdOrEmail,
        limit: 1,
      });
      
      if (customers.data.length === 0) {
        return {
          active: false,
          reason: 'no_customer_found',
        };
      }
      
      customerId = customers.data[0].id;
    }
    
    // Get subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });
    
    if (subscriptions.data.length === 0) {
      // Check for trialing subscriptions
      const trialingSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'trialing',
        limit: 1,
      });
      
      if (trialingSubscriptions.data.length > 0) {
        return {
          active: true,
          status: 'trialing',
          subscription: trialingSubscriptions.data[0],
        };
      }
      
      return {
        active: false,
        reason: 'no_active_subscription',
      };
    }
    
    return {
      active: true,
      status: 'active',
      subscription: subscriptions.data[0],
    };

  } catch (error) {
    console.error('❌ Subscription check error:', error.message);
    return {
      active: false,
      error: error.message,
    };
  }
}

// ==================== CANCEL SUBSCRIPTION ====================
async function cancelSubscription(subscriptionId) {
  try {
    const subscription = await stripe.subscriptions.cancel(subscriptionId);
    
    console.log('✅ Subscription cancelled:', subscriptionId);
    return {
      success: true,
      subscription: subscription,
    };
  } catch (error) {
    console.error('❌ Cancellation error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ==================== CREATE CUSTOMER PORTAL SESSION ====================
// Let users manage their subscription
async function createPortalSession(customerId) {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.DOMAIN}/chat.html`,
    });
    
    return {
      success: true,
      url: session.url,
    };
  } catch (error) {
    console.error('❌ Portal session error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// ==================== WEBHOOK EVENT HANDLERS ====================

// Process webhook events
function processWebhookEvent(event) {
  console.log('🔔 Processing webhook:', event.type);
  
  switch (event.type) {
    case 'checkout.session.completed':
      return {
        type: 'checkout_completed',
        email: event.data.object.customer_email || event.data.object.customer_details?.email,
        customerId: event.data.object.customer,
        subscriptionId: event.data.object.subscription,
      };
      
    case 'customer.subscription.created':
      return {
        type: 'subscription_created',
        subscriptionId: event.data.object.id,
        customerId: event.data.object.customer,
        status: event.data.object.status,
      };
      
    case 'customer.subscription.updated':
      return {
        type: 'subscription_updated',
        subscriptionId: event.data.object.id,
        status: event.data.object.status,
      };
      
    case 'customer.subscription.deleted':
      return {
        type: 'subscription_cancelled',
        subscriptionId: event.data.object.id,
      };
      
    case 'invoice.payment_succeeded':
      return {
        type: 'payment_succeeded',
        subscriptionId: event.data.object.subscription,
        amount: event.data.object.amount_paid,
      };
      
    case 'invoice.payment_failed':
      return {
        type: 'payment_failed',
        subscriptionId: event.data.object.subscription,
        customerId: event.data.object.customer,
      };
      
    default:
      return {
        type: 'unknown',
        eventType: event.type,
      };
  }
}

module.exports = {
  createCheckoutSession,
  verifyCheckoutSession,
  checkSubscriptionStatus,
  cancelSubscription,
  createPortalSession,
  processWebhookEvent,
  VERA_SUBSCRIPTION_CONFIG,
};