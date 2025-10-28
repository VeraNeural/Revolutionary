# VERA 48-Hour Trial + Stripe Setup

## Overview

Your VERA system uses a **48-hour database-managed trial** instead of Stripe's trial period. This gives you precise control over the trial duration.

## How It Works

### Trial Flow

1. **User signs up** → Gets 48-hour trial with magic link
2. **Database sets** `trial_ends_at = NOW() + 48 hours`
3. **User chats freely** for 48 hours
4. **At 12 hours remaining** → Trial banner turns red, upgrade modal shows
5. **At 0 hours** → Trial expired, chat blocked, upgrade required
6. **User upgrades** → Stripe charged immediately (no trial)
7. **Subscription active** → Full access restored

---

## Configuration

### Database Fields

```sql
trial_starts_at    -- When trial began
trial_ends_at      -- When trial expires (NOW + 48 hours)
subscription_status -- 'inactive', 'trialing', 'active'
```

### Stripe Price ID

```
price_1SMtjQF8aJ0BDqA3wHuGgeiD
```

- **Type**: Recurring subscription
- **Amount**: $12/month
- **No trial period** ← Stripe charges immediately on upgrade

---

## Key Files

### Frontend (chat.html)

- **Trial Banner**: Shows 48-hour countdown
- **Upgrade Modal**: Appears at 12 hours + when expired
- **Access Control**: Catches 403 errors when trial expires

### Backend (server.js)

- **POST /api/chat**: Validates trial/subscription status
  - Returns `403 TRIAL_EXPIRED` if no valid trial & no subscription
- **POST /api/create-checkout-session**: Creates Stripe session
  - ✅ **NO trial_period_days** (all removed)
  - Charges immediately
- **GET /create-account**: Handles post-payment setup

### Success Page (create-account.html)

- Displays success animation
- Auto-redirects to chat after 2 seconds
- Shows error states with retry options

---

## Trial Status Check

### During Chat

```javascript
// Backend validates on EVERY message:
- Is trial_ends_at > NOW? → Allow message
- Is subscription_status = 'active'? → Allow message
- Otherwise → Deny with 403 error
```

### Frontend Handles

```javascript
// When 403 TRIAL_EXPIRED received:
- Show upgrade modal
- Update message: "Trial expired. Upgrade to continue."
- Button redirects to /subscribe.html
```

---

## Testing Checklist

- [ ] User receives 48-hour trial on signup
- [ ] Trial banner shows correct countdown
- [ ] Banner turns red at 12 hours
- [ ] Upgrade modal appears at 12 hours
- [ ] User can dismiss modal and keep chatting
- [ ] User can upgrade by clicking "Upgrade Now"
- [ ] Stripe checkout opens with correct price
- [ ] After payment, redirected to success page
- [ ] Success page auto-redirects to chat
- [ ] User can chat after upgrade
- [ ] After trial expires, next message blocked (403)
- [ ] Upgrade modal shows again after expiration

---

## Stripe Dashboard

### Monitor

1. Go to Dashboard → Subscriptions
2. Filter by status: `active`, `trialing`
3. Watch for:
   - ✅ New subscriptions charging $12/month
   - ✅ No trial periods applied
   - ✅ Customer updates on failed payment

### Webhooks

Configured events:

- `charge.succeeded` - Track payments
- `customer.subscription.updated` - Track status changes
- `customer.subscription.deleted` - Track cancellations

---

## Important: 48-Hour Precision

**Why not use Stripe's trial?**

- Stripe `trial_period_days` only accepts full days (1, 2, 3...)
- Can't set 1.5 days or 2.5 days
- Your 48-hour trial needs exact precision

**Solution: Database-managed trial**

- `trial_ends_at = CURRENT_TIMESTAMP + INTERVAL '48 hours'`
- Expires exactly 48 hours later
- Checked on every API call
- Perfect for your 48-hour requirement

---

## Troubleshooting

### User says "Trial not working"

1. Check database: `SELECT trial_ends_at FROM users WHERE email = 'user@example.com'`
2. Verify it's 48 hours from signup: `SELECT NOW() - trial_ends_at`
3. Check banner shows correct countdown

### User can't upgrade

1. Check Stripe API key in `.env`: `STRIPE_SECRET_KEY`
2. Verify price exists: Check Stripe Dashboard
3. Check price ID matches: `STRIPE_PRICE_ID` in `.env`

### Trial expired but user can still chat

1. Check `trial_ends_at` in database (may be NULL)
2. Check `subscription_status` (may be 'active' by mistake)
3. Restart server (cache issue)

---

## Summary

✅ 48-hour trial managed by database
✅ Stripe charges immediately on upgrade ($12/month)
✅ No Stripe trial period applied
✅ Precise 48-hour countdown
✅ Full access control on backend
✅ Beautiful upgrade flow on frontend
