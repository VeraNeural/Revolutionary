# Dual Community Pricing Implementation - Test Guide

## Overview
The system now supports TWO different pricing offers via `/community-pricing` endpoint:

1. **Community Offer** (60 days free)
2. **Professional Offer** (7 days free, then $19/month)

Both use different price IDs but share the same infrastructure.

---

## Implementation Details

### How It Works

#### Flow 1: New User Clicks Community Link
```
User clicks: /community-pricing?priceId=price_1SMucpF8aJ0BDqA3asphVGOX&source=community
    ↓
Server checks: Is user logged in? (NO)
    ↓
Redirect to: /chat.html?priceId=price_1SMucpF8aJ0BDqA3asphVGOX&source=community
    ↓
Chat.html captures priceId and source in sessionStorage
    ↓
User enters name, clicks "Enter"
    ↓
Modal shows signup form
    ↓
User submits email
    ↓
handleSignup() sends:
  {
    email: "user@example.com",
    firstName: "John",
    lastName: "Doe",
    priceId: "price_1SMucpF8aJ0BDqA3asphVGOX",
    source: "community"
  }
    ↓
Server creates checkout with COMMUNITY PRICE ID (60-day trial)
    ↓
Stripe checkout opens
    ↓
User completes payment
    ↓
Webhook: checkout.session.completed
    ↓
Account created, user logged in
    ↓
Redirected to /chat.html (60-day trial active)
```

#### Flow 2: Returning User Clicks Professional Link
```
User clicks: /community-pricing?priceId=price_1SIgAtF8aJ0BDqA3WXVJsuVD&source=professional
    ↓
Server checks: Is user logged in? (YES)
    ↓
Check subscription status
    ↓
If NO active subscription:
  Redirect to: /checkout.html?priceId=price_1SIgAtF8aJ0BDqA3WXVJsuVD&source=professional
    ↓
If ALREADY has active subscription:
  Redirect to: /chat.html (already subscribed)
```

---

## Test Cases

### ✅ Test Case 1: New User - Community Offer (60 days)

**Setup:**
- Clear cookies/sessionStorage
- Use incognito window

**Steps:**
1. Visit: `http://localhost:8080/community-pricing?priceId=price_1SMucpF8aJ0BDqA3asphVGOX&source=community`
2. Verify redirect to `/chat.html`
3. Look for console logs:
   ```
   🎁 Community pricing detected: price_1SMucpF8aJ0BDqA3asphVGOX
   ```
4. Enter name, click "Enter"
5. Complete signup form
6. In server logs, verify:
   ```
   🎁 Using community price ID: price_1SMucpF8aJ0BDqA3asphVGOX
   📊 Source: community
   ```
7. Complete Stripe checkout
8. Verify user has 60-day trial

**Expected Result:** ✅ User created with community 60-day trial

---

### ✅ Test Case 2: New User - Professional Offer (7 days)

**Setup:**
- Clear cookies/sessionStorage
- Use incognito window

**Steps:**
1. Visit: `http://localhost:8080/community-pricing?priceId=price_1SIgAtF8aJ0BDqA3WXVJsuVD&source=professional`
2. Verify redirect to `/chat.html`
3. Look for console logs:
   ```
   🎁 Community pricing detected: price_1SIgAtF8aJ0BDqA3WXVJsuVD
   ```
4. Enter name, click "Enter"
5. Complete signup form
6. In server logs, verify:
   ```
   🎁 Using community price ID: price_1SIgAtF8aJ0BDqA3WXVJsuVD
   📊 Source: professional
   ```
7. Complete Stripe checkout
8. Verify user has 7-day trial

**Expected Result:** ✅ User created with professional 7-day trial

---

### ✅ Test Case 3: Authenticated User - Both Offers

**Setup:**
- Login with existing account (no active subscription)

**Steps:**
1. Visit: `http://localhost:8080/community-pricing?priceId=price_1SMucpF8aJ0BDqA3asphVGOX&source=community`
2. Server should check auth and redirect to checkout page (if this page exists)
3. In server logs, verify:
   ```
   ✅ Authenticated user visiting community pricing
   🎁 Showing community pricing checkout to returning user
   ```
4. Redirect should include the priceId and source in URL parameters

**Expected Result:** ✅ Authenticated user routed to checkout with correct pricing

---

### ✅ Test Case 4: Missing priceId Parameter

**Steps:**
1. Visit: `http://localhost:8080/community-pricing` (no parameters)
2. Should redirect to: `/?error=missing_price`
3. Server logs should show error handling

**Expected Result:** ✅ Error handling works, user redirected safely

---

## Server-Side Flow Validation

### Endpoint: `/community-pricing` (GET)
**Location:** `server.js` line ~1306

**Parameters:**
- `priceId` (required) - The Stripe price ID to use
- `source` (optional) - Tracking source (e.g., "community", "professional")

**Logic:**
1. Validates priceId exists
2. Checks if user is authenticated
3. Routes based on subscription status
4. Preserves priceId and source through redirect chain

**Success Logs:**
```
🎁 Redirecting to signup with community pricing params
🎁 Showing community pricing checkout to returning user
```

---

### Endpoint: `/api/create-checkout-session` (POST)
**Location:** `server.js` line ~1133

**Request Body:**
```json
{
  "email": "user@example.com",
  "priceId": "price_1SMucpF8aJ0BDqA3asphVGOX",
  "source": "community",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Key Logic:**
- Line 1137-1140: Logs the community price ID
- Line 1176: Uses provided priceId OR falls back to default
- Line 1189: Includes source in Stripe metadata
- Line 1228: Uses provided priceId for existing customers
- Line 1290: Uses provided priceId for new customers

**Success Logs:**
```
🎁 Using community price ID: price_1SMucpF8aJ0BDqA3asphVGOX
📊 Source: community
✅ New checkout session created: cs_live_xxx
```

---

## Client-Side Flow Validation

### chat.html - URL Parameter Capture
**Location:** `public/chat.html` line ~2275

**What it does:**
1. Captures `priceId` from URL query params
2. Captures `source` from URL query params
3. Stores both in `sessionStorage`
4. Cleans URL to hide parameters
5. Logs: `🎁 Community pricing detected: {priceId}`

**Code:**
```javascript
const urlParams = new URLSearchParams(window.location.search);
const communityPriceId = urlParams.get('priceId');
const communitySource = urlParams.get('source');

if (communityPriceId) {
    console.log('🎁 Community pricing detected:', communityPriceId);
    sessionStorage.setItem('communityPriceId', communityPriceId);
    sessionStorage.setItem('communitySource', communitySource);
}
```

---

### handleSignup() - Passing priceId to API
**Location:** `public/chat.html` line ~2391

**What it does:**
1. Retrieves stored `communityPriceId` from sessionStorage
2. Retrieves stored `communitySource` from sessionStorage
3. Includes both in checkout session request
4. Falls back gracefully if not present

**Code:**
```javascript
const communityPriceId = sessionStorage.getItem('communityPriceId');
const communitySource = sessionStorage.getItem('communitySource');

const checkoutBody = {
    email,
    firstName,
    lastName,
    anonId,
    returnUrl: window.location.href
};

if (communityPriceId) {
    checkoutBody.priceId = communityPriceId;
    checkoutBody.source = communitySource || 'community';
}
```

---

## Metadata Tracking

Both offers track the source in Stripe metadata:

### Community Offer
```
metadata: {
  source: "community"
}
```

### Professional Offer
```
metadata: {
  source: "professional"
}
```

You can filter these in Stripe Dashboard or export them for analytics.

---

## Troubleshooting

### Issue: priceId not being used
**Check:**
1. Server logs: Is `🎁 Using community price ID:` showing?
2. Client logs: Is `🎁 Community pricing detected:` showing?
3. Verify priceId is being captured and passed correctly

### Issue: Source not tracked
**Check:**
1. Verify `source` parameter in URL
2. Check Stripe Dashboard → Subscriptions → Metadata
3. Verify server is logging: `📊 Source: {source}`

### Issue: Returning user not recognized
**Check:**
1. User session should persist (cookies)
2. `/api/auth/check` should return `authenticated: true`
3. Database should have active record for email

---

## Summary

✅ **Both pricing offers fully supported**
✅ **Automatic routing based on auth status**
✅ **Metadata tracking for analytics**
✅ **Error handling for missing parameters**
✅ **Backward compatible with default pricing**

**Links:**
- Community: `/community-pricing?priceId=price_1SMucpF8aJ0BDqA3asphVGOX&source=community`
- Professional: `/community-pricing?priceId=price_1SIgAtF8aJ0BDqA3WXVJsuVD&source=professional`
