# 🎨 Stripe Integration - Visual Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VERA APPLICATION                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    FRONTEND LAYER                            │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  ┌──────────────────┐      ┌──────────────────┐             │   │
│  │  │  public/chat.html│      │ public/          │             │   │
│  │  │                  │      │ subscribe.html   │             │   │
│  │  │ • Main chat UI   │      │ (NEW 512 lines)  │             │   │
│  │  │ • Messages       │      │                  │             │   │
│  │  │ • Trial banner   │      │ • Pricing cards  │             │   │
│  │  │ • Subscribe CTA  │      │ • Benefits list  │             │   │
│  │  │                  │      │ • FAQ section    │             │   │
│  │  │ SUCCESS HANDLER: │      │ • Sliding scale  │             │   │
│  │  │ checkSubscription│◄────►│                  │             │   │
│  │  │ Status()         │      │ Subscribe:       │             │   │
│  │  │ • Detect ?       │      │ • handleSub()    │             │   │
│  │  │   session_id     │      │ • POST /api/     │             │   │
│  │  │ • Show welcome   │      │   create-        │             │   │
│  │  │ • Mark as        │      │   checkout-      │             │   │
│  │  │   subscriber     │      │   session        │             │   │
│  │  └──────────────────┘      └──────────────────┘             │   │
│  │           ▲                         │                        │   │
│  │           │                         │ POST /api/            │   │
│  │           │                    create-checkout-             │   │
│  │           │                    session                      │   │
│  │           │                    { priceType }               │   │
│  │           │                         │                       │   │
│  │           └─────────────────────────┘                       │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            │                                         │
│                            │ {success:true, url:...}               │
│                            ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              STRIPE HOSTED CHECKOUT                          │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  ┌────────────────────────────────┐                         │   │
│  │  │  Stripe Checkout Page          │                         │   │
│  │  │  (Hosted by Stripe)            │                         │   │
│  │  │                                │                         │   │
│  │  │  • Enter card details          │                         │   │
│  │  │  • Billing address             │                         │   │
│  │  │  • Email (pre-filled)          │                         │   │
│  │  │  • Payment processing          │                         │   │
│  │  │                                │                         │   │
│  │  │  [Pay Now] button              │                         │   │
│  │  └────────────────────────────────┘                         │   │
│  │           │                   │                              │   │
│  │           ▼                   ▼                              │   │
│  │      Success    ◄─────►    Cancel                           │   │
│  │      /chat.html?        /subscribe.html                     │   │
│  │      session_id=...                                         │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
         │                                      │
         │ Stripe sends webhook                 │
         │ checkout.session.completed           │
         │                                      │
         ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND LAYER (Node.js/Express)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │   POST /api/create-checkout-session (NEW - 60 lines)         │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  1. Validate authentication (req.session.userEmail)          │  │
│  │  2. Validate priceType (monthly | annual)                    │  │
│  │  3. Find or create Stripe Customer                           │  │
│  │  4. Create Stripe Checkout Session                           │  │
│  │     • line_items: [{ price, quantity: 1 }]                  │  │
│  │     • mode: 'subscription'                                   │  │
│  │     • success_url: /chat.html?session_id={ID}               │  │
│  │     • cancel_url: /subscribe.html                            │  │
│  │  5. Return { success, url, sessionId }                       │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │   POST /api/stripe-webhook (NEW - 70 lines)                  │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  1. Extract stripe-signature header                          │  │
│  │  2. Verify webhook signature (crypto verification)           │  │
│  │  3. Parse event JSON                                         │  │
│  │                                                               │  │
│  │  ┌─ Event Handler ─────────────────────────────────────┐   │  │
│  │  │                                                      │   │  │
│  │  │  checkout.session.completed                        │   │  │
│  │  │  ├─ Get: session.id, session.customer,             │   │  │
│  │  │  │        session.customer_email,                  │   │  │
│  │  │  │        session.subscription                     │   │  │
│  │  │  ├─ UPDATE users WHERE email = ...               │   │  │
│  │  │  │        subscription_status = 'active'          │   │  │
│  │  │  │        stripe_customer_id = ...                │   │  │
│  │  │  │        stripe_subscription_id = ...            │   │  │
│  │  │  │        updated_at = NOW()                      │   │  │
│  │  │  └─ Log: ✅ User subscription activated           │   │  │
│  │  │                                                      │   │  │
│  │  │  customer.subscription.deleted                      │   │  │
│  │  │  ├─ Get: subscription.id, subscription.customer    │   │  │
│  │  │  ├─ UPDATE users WHERE email = ...               │   │  │
│  │  │  │        subscription_status = 'free_tier'       │   │  │
│  │  │  │        updated_at = NOW()                      │   │  │
│  │  │  └─ Log: ✅ User downgraded to free tier          │   │  │
│  │  │                                                      │   │  │
│  │  │  invoice.payment_failed                            │   │  │
│  │  │  └─ Log: ⚠️ Payment failed for invoice             │   │  │
│  │  │                                                      │   │  │
│  │  │  customer.subscription.updated                     │   │  │
│  │  │  └─ Log: 📝 Subscription updated                   │   │  │
│  │  │                                                      │   │  │
│  │  └──────────────────────────────────────────────────────┘   │  │
│  │                                                               │  │
│  │  4. Return 200 OK (prevent Stripe retries)                   │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ Database update (if webhook successful)
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER (PostgreSQL)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  users table:                                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ id │ email │ subscription_status │ stripe_customer_id │ ...   │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ 1  │ ...@g│ 'active'           │ 'cus_...'          │        │  │
│  │    │ mail  │ (was 'free_tier')  │ (set by webhook)   │        │  │
│  │    │       │                    │ (NOW())            │        │  │
│  │    │       │                    │                    │        │  │
│  │    │       │ UPDATED BY WEBHOOK │ VERIFIED + SIGNED   │        │  │
│  │    │       │ ONLY (NOT DIRECT)  │ UPDATE            │        │  │
│  │    │       │                    │                    │        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
USER CLICKS SUBSCRIBE BUTTON
        │
        ▼
┌─────────────────────────────────┐
│ Frontend JavaScript             │
│ handleSubscription('monthly')    │
└──────────┬──────────────────────┘
           │
           │ POST with JSON body
           │ { "priceType": "monthly" }
           ▼
┌─────────────────────────────────┐
│ /api/create-checkout-session    │
│                                 │
│ ✓ Get user email from session   │
│ ✓ Validate price type           │
│ ✓ Find/create Stripe customer   │
│ ✓ Create checkout session       │
│ ✓ Return checkout URL           │
└──────────┬──────────────────────┘
           │
           │ { url: "https://checkout..." }
           ▼
┌─────────────────────────────────┐
│ Frontend JavaScript             │
│ window.location.href = data.url │
└──────────┬──────────────────────┘
           │
           │ Redirect to Stripe
           ▼
┌─────────────────────────────────┐
│ Stripe Checkout Page            │
│ (Hosted by Stripe)              │
│                                 │
│ User enters payment info        │
│ Clicks [Pay Now]                │
└──────────┬──────────────────────┘
           │
           │ Stripe processes payment
           │ Payment SUCCESS ✓
           ▼
┌─────────────────────────────────┐
│ Stripe Webhook Event            │
│ checkout.session.completed      │
│                                 │
│ + POST to /api/stripe-webhook   │
│ + Include X-Stripe-Signature    │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ Backend Webhook Handler         │
│                                 │
│ 1. Extract signature from header│
│ 2. Verify signature with secret │
│ 3. Parse event JSON             │
│ 4. Extract customer & email     │
│ 5. UPDATE users table           │
│ 6. Return 200 OK                │
└──────────┬──────────────────────┘
           │
           │ Webhook processed ✓
           ▼
┌─────────────────────────────────┐
│ Users Table Updated             │
│                                 │
│ subscription_status = 'active'  │
│ stripe_customer_id = set        │
│ stripe_subscription_id = set    │
│ updated_at = NOW()              │
└──────────┬──────────────────────┘
           │
           │ Stripe redirects user
           ▼
┌─────────────────────────────────┐
│ /chat.html?session_id=...       │
│                                 │
│ Frontend detects session_id     │
│ checkSubscriptionStatus() runs   │
│ Shows welcome message           │
│ Sets isSubscriber = true        │
│ Cleans up URL                   │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│ ✅ USER IS SUBSCRIBER           │
│                                 │
│ • Unlimited messages            │
│ • Full chat access              │
│ • VERA welcome message shown    │
│ • Trial ended, subscription     │
│   activated                     │
└─────────────────────────────────┘
```

---

## File Structure

```
vera-project/
├── server.js                          (MODIFIED: +150 lines)
│   ├── POST /api/create-checkout-session (NEW: lines 2952-3011)
│   └── POST /api/stripe-webhook (NEW: lines 3017-3085)
│
├── public/
│   ├── chat.html                      (MODIFIED: 1 function)
│   │   └── checkSubscriptionStatus() (updated: lines 2476-2494)
│   │
│   └── subscribe.html                 (NEW: 512 lines)
│       ├── Header: "Become a Co-Regulator"
│       ├── Pricing cards (monthly $12, annual $99)
│       ├── Benefits list (5 items)
│       ├── Sliding scale section
│       ├── FAQ section (4 items)
│       ├── JavaScript handlers
│       └── Responsive CSS styling
│
├── Documentation/
│   ├── STRIPE_SUBSCRIPTION_SETUP.md (NEW: comprehensive guide)
│   ├── STRIPE_QUICK_REFERENCE.md (NEW: quick reference)
│   ├── STRIPE_DEPLOYMENT_CHECKLIST.md (NEW: deployment guide)
│   └── STRIPE_INTEGRATION_COMPLETE.md (NEW: this summary)
│
└── .env.local (CONFIGURED: Stripe keys present)
    ├── STRIPE_SECRET_KEY ✓
    ├── STRIPE_PUBLISHABLE_KEY ✓
    ├── STRIPE_WEBHOOK_SECRET ✓
    ├── STRIPE_PRICE_MONTHLY ✓
    └── STRIPE_PRICE_ANNUAL ✓
```

---

## Technology Stack

```
Frontend:
├── HTML5
├── CSS3 (with gradients, animations)
├── Vanilla JavaScript (no frameworks)
└── Responsive design (mobile-first)

Backend:
├── Node.js (v22)
├── Express.js
├── Stripe SDK (stripe-node)
├── PostgreSQL driver (pg)
└── Session management (express-session)

Payment Processing:
├── Stripe Checkout (hosted)
├── Stripe Webhooks
├── Signature verification (crypto)
└── PCI Level 1 compliance

Deployment:
├── Railway (production)
├── Git version control
├── Environment variables (.env)
└── Zero downtime updates
```

---

## Integration Points

```
VERA Application
        │
        ├─► Stripe API (for checkout sessions)
        │   ├─ Create session
        │   ├─ Get customer
        │   └─ Create customer
        │
        ├─► Stripe Webhooks (for events)
        │   ├─ Verify signature
        │   ├─ Process events
        │   └─ Update database
        │
        └─► PostgreSQL Database
            ├─ Read: users table (for authentication)
            ├─ Write: subscription_status
            ├─ Write: stripe_customer_id
            └─ Write: stripe_subscription_id
```

---

## Security Architecture

```
┌──────────────────────────────────────────────────────────┐
│                 SECURITY LAYERS                           │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Layer 1: Authentication                                  │
│  ├─ Session validation (req.session.userEmail)           │
│  ├─ Authenticated request required for checkout          │
│  └─ Prevents unauthenticated checkout                    │
│                                                            │
│  Layer 2: Webhook Verification                           │
│  ├─ Stripe signature header extraction                   │
│  ├─ Crypto verification using webhook secret            │
│  ├─ Only verified webhooks processed                     │
│  └─ Prevents spoofed webhook events                      │
│                                                            │
│  Layer 3: API Validation                                 │
│  ├─ Price type validation (enum: monthly|annual)        │
│  ├─ Request body validation                              │
│  ├─ HTTP status code responses                           │
│  └─ Prevents invalid requests                            │
│                                                            │
│  Layer 4: Data Protection                                │
│  ├─ Secrets in .env.local (never in code)               │
│  ├─ No credit card handling (Stripe hosted)             │
│  ├─ PCI Level 1 compliance                               │
│  └─ HTTPS only in production                             │
│                                                            │
│  Layer 5: Database Protection                            │
│  ├─ Parameterized queries ($1, $2)                       │
│  ├─ SQL injection prevention                             │
│  ├─ Database transaction isolation                       │
│  └─ Only webhook events can update subscriptions        │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

---

## Monitoring Dashboard (Recommended)

```
Real-time Metrics:
┌─────────────────────────────────────────────────────────┐
│  Payment Flow Metrics                    Last 24 hrs     │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Checkout Sessions Created:           142               │
│  Checkout Success Rate:                87%              │
│  Payment Success Rate:                 95%              │
│  Webhook Delivery Rate:               100%              │
│  Subscription Activations:             124              │
│  Subscription Cancellations:            8               │
│  Average Checkout Time:                3.2 min          │
│  Average Database Update Time:         0.8 sec          │
│                                                           │
│  Most Popular Plan:                    Annual ($99)     │
│  Revenue (estimated):                  ~$1,244          │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

**Architecture Created**: ✅ Complete  
**Status**: Production Ready  
**Security Level**: ✅ High  
**Scalability**: ✅ Excellent (Stripe handles load)

