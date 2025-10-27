# 💳 Stripe Integration - Quick Reference

## Files Modified/Created

### ✨ New Files
1. **`public/subscribe.html`** - Subscription landing page (586 lines)
   - Beautiful UI with pricing cards
   - Benefits and FAQ sections
   - JavaScript handlers for checkout

2. **`STRIPE_SUBSCRIPTION_SETUP.md`** - Complete setup documentation

### 🔧 Modified Files
1. **`server.js`** - Added two endpoints
   - `POST /api/create-checkout-session` (lines 2952-3011)
   - `POST /api/stripe-webhook` (lines 3016-3085)

2. **`public/chat.html`** - Updated success handling
   - Modified `checkSubscriptionStatus()` function (lines 2476-2494)
   - Now displays success message on return from Stripe

---

## 🔌 API Endpoints

### CREATE CHECKOUT SESSION
```
POST /api/create-checkout-session
Content-Type: application/json

{
  "priceType": "monthly" | "annual"
}

Response:
{
  "success": true,
  "url": "https://checkout.stripe.com/pay/...",
  "sessionId": "cs_test_..."
}
```

### STRIPE WEBHOOK
```
POST /api/stripe-webhook
X-Stripe-Signature: [signature]

Handles:
- checkout.session.completed       → subscription_status = 'active'
- customer.subscription.deleted    → subscription_status = 'free_tier'
- invoice.payment_failed           → log error
- customer.subscription.updated    → log event
```

---

## 💰 Pricing Configuration

| Plan | Price | Billing | Savings |
|------|-------|---------|---------|
| Monthly | $12/month | Monthly | - |
| Annual | $99/year | Yearly | $45 (2 months free) |
| Sliding Scale | Custom | Custom | Negotiable |

**Price IDs** (in `.env.local`):
```
STRIPE_PRICE_MONTHLY=price_1SIgAtF8aJ0BDqA3WXVJsuVD
STRIPE_PRICE_ANNUAL=price_1SIgAtF8aJ0BDqA3WXVJsuVD
```

---

## 🔄 User Flow

```
1. User at /subscribe.html
   ↓
2. Click "Subscribe - $12/month" or "Save with Annual"
   ↓
3. JavaScript: handleSubscription(priceType)
   ↓
4. POST /api/create-checkout-session with {priceType}
   ↓
5. Backend: Create Stripe Customer (if needed), create Checkout Session
   ↓
6. Return: { success: true, url: "https://checkout.stripe.com/..." }
   ↓
7. Frontend: window.location.href = response.url
   ↓
8. User at Stripe Checkout → Completes Payment
   ↓
9. Stripe: Sends webhook checkout.session.completed
   ↓
10. Backend: Verify signature, update user subscription_status = 'active'
    ↓
11. Stripe: Redirect user to /chat.html?session_id=cs_test_...
    ↓
12. Frontend: checkSubscriptionStatus() detects session_id
    ↓
13. Sets isSubscriber = true, shows welcome message
    ↓
14. ✅ User has unlimited access
```

---

## 🧪 Test Payment Cards

Use in Stripe Testmode Checkout:

| Outcome | Card | Expiry | CVC |
|---------|------|--------|-----|
| ✅ Success | 4242 4242 4242 4242 | Any future | Any 3 digits |
| ❌ Decline | 4000 0000 0000 0002 | Any future | Any 3 digits |
| ⏸️ Decline (Lost Card) | 4000 0000 0000 0259 | Any future | Any 3 digits |

---

## 🔐 Security Checklist

- [x] Use server-side checkout session creation (not client-side)
- [x] Verify webhook signatures using STRIPE_WEBHOOK_SECRET
- [x] Store Stripe secrets in .env.local (never in code)
- [x] Return 200 OK for all valid webhook signatures
- [x] Validate user authentication before checkout
- [x] Validate price type before creating session
- [x] Use HTTPS in production
- [x] Never expose secret keys to frontend

---

## 📊 Monitoring URLs

Once deployed to production:

1. **Webhook Delivery**: 
   - Stripe Dashboard → Developers → Webhooks → [webhook endpoint]
   - Shows all webhook events and delivery status

2. **Payment Events**:
   - Stripe Dashboard → Payments → Checkout Sessions
   - See all checkout sessions, payments, and statuses

3. **Subscriptions**:
   - Stripe Dashboard → Billing → Subscriptions
   - View active, cancelled, and past-due subscriptions

4. **Customers**:
   - Stripe Dashboard → Customers
   - See all customer records and payment methods

---

## 🚨 Troubleshooting

### "Not authenticated" error
- User must be logged in or have active session
- Check `/api/auth/check` endpoint

### "Invalid price type" error
- Must be exactly "monthly" or "annual"
- Check frontend JavaScript for typos

### Webhook not updating database
- Verify STRIPE_WEBHOOK_SECRET is correct
- Check database connectivity
- Review server console for error logs

### Stripe redirect goes to wrong URL
- Verify APP_URL is set in .env.local
- Checkout session URLs use this for redirects

### Test payment doesn't trigger webhook
- Make sure webhook endpoint is configured in Stripe Dashboard
- Use Stripe CLI: `stripe listen --forward-to localhost:8080/api/stripe-webhook`

---

## 🎯 Next Steps

1. **Manual Setup in Stripe Dashboard**:
   - Ensure monthly and annual products are created
   - Verify price IDs match environment variables

2. **Webhook Configuration**:
   - Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `{APP_URL}/api/stripe-webhook`
   - Subscribe to: checkout.session.completed, customer.subscription.deleted, invoice.payment_failed

3. **Testing**:
   - Run local: `node server.js`
   - Navigate to: `http://localhost:8080/subscribe.html`
   - Use test cards to verify flow

4. **Deployment**:
   - Deploy to Railway
   - Update Stripe webhook endpoint to production URL
   - Test end-to-end in production

---

## 📝 Code Locations

- **Subscription Page**: `/public/subscribe.html` (586 lines)
- **Checkout Endpoint**: `/server.js` lines 2952-3011
- **Webhook Handler**: `/server.js` lines 3016-3085
- **Success Handler**: `/public/chat.html` lines 2476-2494

---

**Status**: ✅ Ready to Deploy

