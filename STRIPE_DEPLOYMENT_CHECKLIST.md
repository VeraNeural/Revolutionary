# 🚀 Stripe Integration - Deployment Checklist

## Pre-Deployment Verification

### ✅ Code Changes

- [x] Created `/public/subscribe.html` (subscription landing page)
- [x] Added `/api/create-checkout-session` endpoint in `server.js`
- [x] Added `/api/stripe-webhook` endpoint in `server.js`
- [x] Updated `checkSubscriptionStatus()` in `public/chat.html`
- [x] All endpoints have proper error handling
- [x] All endpoints have console logging for monitoring
- [x] Webhook signature verification implemented
- [x] Database integration complete

### ✅ Environment Variables

Required in `.env.local` (already configured):

```
STRIPE_SECRET_KEY=sk_live_51S6LXtF8aJ0BDqA3...  ✓
STRIPE_PUBLISHABLE_KEY=pk_live_51S6LXtF8aJ0BDqA3...  ✓
STRIPE_WEBHOOK_SECRET=whsec_LsF64HhRLt6FWlGoXmyobgYVQBAeOJw9...  ✓
STRIPE_PRICE_MONTHLY=price_1SIgAtF8aJ0BDqA3WXVJsuVD  ✓
STRIPE_PRICE_ANNUAL=price_1SIgAtF8aJ0BDqA3WXVJsuVD  ✓
APP_URL=https://revolutionary-production.up.railway.app  ✓
```

---

## Before Going Live

### Step 1: Verify Stripe Configuration

- [ ] Log into Stripe Dashboard (live mode)
- [ ] Confirm monthly product exists with correct price ($12/month)
- [ ] Confirm annual product exists with correct price ($99/year)
- [ ] Update `.env.local` with actual price IDs if different:
  ```
  STRIPE_PRICE_MONTHLY=price_YOUR_MONTHLY_ID
  STRIPE_PRICE_ANNUAL=price_YOUR_ANNUAL_ID
  ```

### Step 2: Configure Webhook Endpoint

- [ ] Stripe Dashboard → Developers → Webhooks
- [ ] Click "Add an endpoint"
- [ ] Endpoint URL: `https://revolutionary-production.up.railway.app/api/stripe-webhook`
- [ ] Events to subscribe to:
  - [x] `checkout.session.completed`
  - [x] `customer.subscription.deleted`
  - [x] `invoice.payment_failed`
  - [x] `customer.subscription.updated`
- [ ] Save webhook
- [ ] Copy webhook signing secret: `whsec_...`
- [ ] Update in `.env.local`: `STRIPE_WEBHOOK_SECRET=whsec_...`

### Step 3: Local Testing

- [ ] Run: `node server.js`
- [ ] Visit: `http://localhost:8080/subscribe.html`
- [ ] Page loads without errors
- [ ] Click "Subscribe - $12/month" button
- [ ] Checkout session endpoint responds with Stripe URL
- [ ] Use test card: `4242 4242 4242 4242`
- [ ] Verify successful redirect to `/chat.html?session_id=...`

### Step 4: Deploy to Production

- [ ] Commit all changes to git
- [ ] Push to Railway
- [ ] Verify deployment successful
- [ ] Environment variables updated on Railway

### Step 5: Production Testing

- [ ] Visit: `https://revolutionary-production.up.railway.app/subscribe.html`
- [ ] Button clicks work (no 404s)
- [ ] Can reach Stripe Checkout
- [ ] Test with actual card OR use Stripe test mode
- [ ] Verify webhook is received:
  - Stripe Dashboard → Developers → Webhooks → [endpoint]
  - Should show successful delivery in events log

### Step 6: Monitor First 24 Hours

- [ ] Watch server console for errors:
  ```bash
  # On Railway:
  railway logs --follow
  ```
- [ ] Check for webhook delivery issues:
  - Stripe Dashboard → Webhooks → Events
- [ ] Test chat functionality post-subscription
- [ ] Verify trial system still works for non-subscribers

---

## File Changes Summary

### Created Files

```
public/subscribe.html                   (586 lines)
STRIPE_SUBSCRIPTION_SETUP.md            (comprehensive guide)
STRIPE_QUICK_REFERENCE.md               (quick reference)
STRIPE_DEPLOYMENT_CHECKLIST.md          (this file)
```

### Modified Files

```
server.js                               (+150 lines for Stripe endpoints)
public/chat.html                        (checkSubscriptionStatus function updated)
```

---

## API Endpoint Documentation

### POST /api/create-checkout-session

**Purpose**: Create a Stripe Checkout session for subscription

**Request**:

```bash
curl -X POST https://revolutionary-production.up.railway.app/api/create-checkout-session \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \
  -d '{"priceType": "monthly"}'
```

**Response** (Success):

```json
{
  "success": true,
  "url": "https://checkout.stripe.com/pay/cs_test_...",
  "sessionId": "cs_test_..."
}
```

**Response** (Error - Not Authenticated):

```json
{
  "success": false,
  "error": "Not authenticated"
}
```

### POST /api/stripe-webhook

**Purpose**: Receive and process Stripe webhook events

**Stripe Sends**:

```bash
POST /api/stripe-webhook
X-Stripe-Signature: t=1630703240,v1=abc123,...

{
  "id": "evt_...",
  "type": "checkout.session.completed",
  "data": {...}
}
```

**Server Responds**: `200 OK`

**Events Processed**:

1. `checkout.session.completed` → Sets `subscription_status = 'active'`
2. `customer.subscription.deleted` → Sets `subscription_status = 'free_tier'`
3. `invoice.payment_failed` → Logs payment failure
4. `customer.subscription.updated` → Logs subscription change

---

## Monitoring & Alerts

### Key Metrics to Watch

- [ ] Webhook delivery success rate (should be 100%)
- [ ] Checkout completion rate
- [ ] Payment success rate
- [ ] Error rate in `/api/create-checkout-session`
- [ ] Database update latency

### What to Watch For

```
❌ Red Flags:
- Webhook delivery failures
- "Not authenticated" errors
- Webhook processing errors in logs
- Database update failures
- Checkout URL generation errors

✅ Healthy Signs:
- Webhook shows "Webhook endpoint responded 200"
- Users successfully redirected to chat after payment
- subscription_status updated to 'active' in database
- No errors in server console
```

### Logging Examples

**Successful Flow**:

```
💳 Creating checkout session for user@example.com, type: monthly
✅ Checkout session created: cs_test_...
[User redirected to Stripe]
📨 Webhook event: checkout.session.completed
✅ Checkout session completed: cs_test_...
✅ User subscription activated: user@example.com
```

**Error Flow**:

```
❌ Checkout session error: Invalid price type
❌ Webhook signature verification failed: Invalid signature
❌ Webhook processing error: Database connection failed
```

---

## Rollback Plan (If Issues Arise)

### Option 1: Quick Revert

```bash
# Revert last commit
git revert HEAD
railway deploy
```

### Option 2: Disable Stripe Temporarily

- Comment out `/api/create-checkout-session` endpoint
- Comment out `/api/stripe-webhook` endpoint
- Keep trial system active as fallback
- Deploy
- Investigate issues

### Option 3: Run in Maintenance Mode

- Set banner: "Subscription temporarily unavailable"
- Redirect `/subscribe.html` to `/chat.html`
- Keep trial system for new users
- Investigation continues

---

## Success Criteria

✅ **Go-Live Ready When**:

1. [ ] Stripe webhook endpoint configured and verified
2. [ ] Test payment flow completes successfully (end-to-end)
3. [ ] Database updates correctly after payment
4. [ ] User can chat unlimited after subscription
5. [ ] Welcome message appears on return from Stripe
6. [ ] All environment variables configured on Railway
7. [ ] Error handling works for edge cases
8. [ ] Logging shows all important events

---

## Post-Launch Tasks

### Day 1

- [ ] Monitor webhook delivery
- [ ] Test a few real conversions if possible
- [ ] Check for any error patterns
- [ ] Verify database integrity

### Week 1

- [ ] Review payment analytics in Stripe Dashboard
- [ ] Check user feedback for payment issues
- [ ] Monitor subscription churn rate
- [ ] Verify email confirmations working (if configured)

### Week 4

- [ ] Review conversion metrics
- [ ] Analyze pricing effectiveness
- [ ] Evaluate cancellation reasons
- [ ] Plan improvements/optimizations

---

## Contact & Support

### If Payment Flow Breaks

1. Check Stripe Dashboard for webhook delivery status
2. Review server logs for errors: `railway logs --follow`
3. Verify database connection: `/api/db-health`
4. Check environment variables on Railway

### Stripe Support

- Dashboard: https://dashboard.stripe.com
- Docs: https://stripe.com/docs
- Status: https://status.stripe.com

### VERA Support

- Check database directly for subscription_status
- Review chat logs for user feedback
- Monitor error logs on Railway

---

## Testing Checklist

### Manual Testing

- [ ] Free user can view `/subscribe.html`
- [ ] Authenticated user can click subscribe buttons
- [ ] Stripe checkout opens successfully
- [ ] Test card completes payment successfully
- [ ] User redirected to chat with success message
- [ ] Database shows `subscription_status = 'active'`
- [ ] User can send unlimited messages
- [ ] Trial banner removed for subscriber

### Edge Cases

- [ ] Unauthenticated user tries to subscribe (should get error or redirected to login)
- [ ] Invalid price type sent (should return error)
- [ ] Payment declined test card (should show Stripe error)
- [ ] User closes checkout without completing (should return to /subscribe.html)
- [ ] Webhook received before user navigates back (should still work)
- [ ] Multiple webhook events for same session (should be idempotent)

---

**Last Updated**: 2025-10-27  
**Status**: ✅ Ready for Deployment  
**Deployed to Production**: [ ] Not Yet
