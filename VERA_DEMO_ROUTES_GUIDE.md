# VERA Demo Routes - 48-Hour Trial System

## Overview

All 4 VERA demo showcase pages are now connected to the main trial-to-paid system with magic links and 48-hour trials.

---

## Routes Configured

### Demo Pages (Showcase/Landing)

These are educational pages showing sample VERA conversations:

| Route       | File                     | Description                           |
| ----------- | ------------------------ | ------------------------------------- |
| `/vera`     | `public/vera-demo.html`  | Core VERA demo - nervous system focus |
| `/vera1`    | `public/vera-demo1.html` | Parents/caregivers - burnout focus    |
| `/vera2`    | `public/vera-demo2.html` | Burnout/overwhelm - somatic focus     |
| `/vera-bet` | `public/vera-bet.html`   | Trauma/grief - witnessing focus       |

### Interactive Chat (Main App)

| Route   | File               | Description                                  |
| ------- | ------------------ | -------------------------------------------- |
| `/chat` | `public/chat.html` | **Interactive** VERA chat with 48-hour trial |

### Pricing & Account

| Route             | File                         | Description                 |
| ----------------- | ---------------------------- | --------------------------- |
| `/promo`          | `public/landing.html`        | Landing page - email signup |
| `/subscribe`      | `public/subscribe.html`      | Pricing & upgrade page      |
| `/create-account` | `public/create-account.html` | Post-payment success page   |

---

## User Journey: From Demo to Trial

### Step 1: User Discovers VERA

```
User visits any demo page:
  → app.veraneural.com/vera
  → app.veraneural.com/vera1
  → app.veraneural.com/vera2
  → app.veraneural.com/vera-bet
```

**What they see**:

- Beautiful showcase of VERA conversations
- Specific use cases (parenting, burnout, trauma)
- "Start Your 48-Hour Free Trial" button
- "48-Hour Free Trial" badge

### Step 2: Click CTA

```
User clicks "Start Your 48-Hour Free Trial"
  ↓
Button links to: /chat.html
  ↓
User redirected to interactive chat
```

### Step 3: Enter Email

```
On /chat.html, user can:
  - Start as guest (limited: 5 messages)
  - OR enter email to get:
    ✅ 48-hour trial with magic link
    ✅ Unlimited messages during trial
    ✅ Trial banner showing countdown
    ✅ Upgrade at 12 hours / after expiration
```

### Step 4: Trial Expires

```
After 48 hours:
  - Next message blocked (403 error)
  - Upgrade modal appears
  - User can:
    ✅ Upgrade ($12/month)
    ✅ Create new trial with different email
```

### Step 5: Upgrade

```
User clicks "Upgrade Now"
  → Stripe checkout ($12/month)
  → Payment processed
  → subscription_status = 'active'
  → Can chat unlimited
```

---

## Database: Trial Setup

### When User Signs Up from Demo

```sql
-- User receives magic link email
-- Database record created:

INSERT INTO users (
  email,
  trial_starts_at,
  trial_ends_at,
  subscription_status
) VALUES (
  'user@example.com',
  NOW(),
  NOW() + INTERVAL '48 hours',  -- ← Exactly 48 hours
  'trialing'
);
```

### Trial Status Check (Every Message)

```javascript
// Server validates on /api/chat:

SELECT trial_ends_at, subscription_status
FROM users
WHERE email = 'user@example.com'

// Check:
if (trial_ends_at > NOW()) → ALLOW MESSAGE ✓
if (subscription_status = 'active') → ALLOW MESSAGE ✓
if (both false) → RETURN 403 TRIAL_EXPIRED ✗
```

---

## Magic Link Flow

### 1. User Enters Email

```
Demo page → "Start Your 48-Hour Free Trial"
  → /chat.html
  → User enters email
  → Click "Get Free Trial"
```

### 2. Backend Sends Magic Link

```javascript
// POST /api/send-trial-magic-link

Create magic link token
Set expires_at = NOW() + 24 hours
Save to magic_links table
Send email with link:
  → app.veraneural.com/auth/verify?token=XYZ
```

### 3. User Clicks Link

```
User clicks link in email:
  → app.veraneural.com/auth/verify?token=XYZ
  → Backend verifies token
  → Check if email matches
  → Set session.userEmail
  → trial_ends_at = NOW() + 48 hours
  → Redirect to /chat.html
  → ✅ User logged in with 48-hour trial
```

### 4. Trial Banner Shows

```
/chat.html loads:
  → updateTrialBanner() called
  → Shows: "2 days left", "1 day left", etc.
  → At 12 hours: turns red, shows "⏰ 12 hours left"
  → Upgrade modal appears
  → User can dismiss or upgrade
```

---

## Key Differences: Demo vs Chat

| Feature        | Demo Page            | Interactive Chat            |
| -------------- | -------------------- | --------------------------- |
| Purpose        | Showcase VERA        | Use VERA                    |
| Content        | Sample conversations | Live AI responses           |
| Trial          | No                   | 48-hour + trial banner      |
| Messages       | Read-only            | Unlimited (if trial/paid)   |
| Upgrade prompt | CTA button           | Modal at 12hrs + expiration |

---

## API Endpoints Used

### From Demo Pages

- `GET /vera` → Serve vera-demo.html
- `GET /vera1` → Serve vera-demo1.html
- `GET /vera2` → Serve vera-demo2.html
- `GET /vera-bet` → Serve vera-bet.html

### From Interactive Chat

- `POST /api/chat` → Send message (validates trial)
- `POST /api/send-trial-magic-link` → Email magic link
- `GET /auth/verify?token=...` → Verify magic link
- `POST /api/create-checkout-session` → Stripe checkout
- `GET /create-account` → Post-payment setup

---

## Testing Checklist

- [ ] Visit `/vera` → See demo, click button → Redirects to `/chat.html`
- [ ] Visit `/vera1` → See demo, click button → Redirects to `/chat.html`
- [ ] Visit `/vera2` → See demo, click button → Redirects to `/chat.html`
- [ ] Visit `/vera-bet` → See demo, click button → Redirects to `/chat.html`
- [ ] Click "Start Your 48-Hour Free Trial" → Takes to chat
- [ ] Enter email on chat → Get magic link
- [ ] Click magic link → Logged in, 48-hour trial active
- [ ] Trial banner shows countdown
- [ ] At 12 hours: banner turns red, modal appears
- [ ] After 48 hours: message blocked (403), upgrade modal shows
- [ ] Upgrade button → Stripe checkout works
- [ ] Payment successful → Can chat again

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    DEMO SHOWCASE PAGES                  │
│                                                         │
│  /vera  /vera1  /vera2  /vera-bet                      │
│  (show sample conversations with CTA buttons)          │
│                                                         │
│  "Start Your 48-Hour Free Trial" → Links to /chat.html │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              INTERACTIVE CHAT (/chat.html)              │
│                                                         │
│  User enters email → Gets magic link → Clicks link     │
│  trial_ends_at = NOW() + 48 hours                      │
│  Trial banner shows countdown                          │
│                                                         │
│  At 12 hours: Warning banner + Upgrade modal           │
│  After 48 hours: 403 error + Upgrade modal             │
└─────────────────────────────────────────────────────────┘
                          ↓
                    (User clicks "Upgrade")
                          ↓
┌─────────────────────────────────────────────────────────┐
│         STRIPE CHECKOUT → POST-PAYMENT SUCCESS          │
│                                                         │
│  Stripe charges $12/month (no trial)                   │
│  subscription_status = 'active'                        │
│  User redirected to /create-account → /chat.html       │
│  ✅ Can chat unlimited                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Email Flow

### Magic Link Email

```
Subject: Your 48-Hour Free Trial Link - VERA

Hi [User],

Click below to start your 48-hour free trial with VERA:

[Button: Verify Email & Start Trial]

Link: app.veraneural.com/auth/verify?token=XYZ

This link expires in 24 hours.

---
VERA Team
```

### Welcome Email (After Upgrade)

```
Subject: Welcome to VERA - Your Subscription is Active

Hi [User],

Your subscription to VERA is now active!

$12/month
Cancel anytime

Start chatting: app.veraneural.com/chat.html

---
VERA Team
```

---

## Configuration Files

### .env (Required)

```
# Routes
APP_URL=https://app.veraneural.com

# Magic Links
MAGIC_LINK_EXPIRES_IN=1440  # 24 hours in minutes

# Trial Duration (in hours)
TRIAL_DURATION_HOURS=48

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRICE_ID=price_1SMtjQF8aJ0BDqA3wHuGgeiD
```

### Routes Summary (server.js)

```javascript
// Demo showcase pages
GET  /vera         → public/vera-demo.html
GET  /vera1        → public/vera-demo1.html
GET  /vera2        → public/vera-demo2.html
GET  /vera-bet     → public/vera-bet.html

// Interactive chat
GET  /chat         → public/chat.html

// Auth & account
POST /api/send-trial-magic-link
GET  /auth/verify?token=...
POST /api/create-checkout-session
GET  /create-account?session_id=...

// Chat API
POST /api/chat     → Validates trial/subscription
```

---

## Summary

✅ **4 demo pages** set up and linked to trial system  
✅ **All use same magic link + 48-hour trial system**  
✅ **CTA buttons link to interactive `/chat.html`**  
✅ **Trial banner, upgrade modal, and access control working**  
✅ **Stripe integration for payment collection**

**Users can now**:

1. Discover VERA on any demo page
2. Start 48-hour free trial with email magic link
3. Chat with AI for 48 hours
4. Get upgrade prompt at 12 hours
5. Subscribe for $12/month
6. Chat unlimited after upgrade

**Production Ready!** 🚀
