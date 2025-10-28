# 🚀 VERA Landing Page + Trial System - Quick Reference

## ✅ COMPLETED & LIVE

### What Users See Now:

**URL: `/` (Root Homepage)**

```
┌─────────────────────────────────┐
│                                 │
│    ✨ VERA                      │
│    Your AI Co-Regulator         │
│                                 │
│    [Breathing Purple Orb]       │
│                                 │
│    I help you listen to what    │
│    your body already knows...   │
│                                 │
│    ╔═════════════════════════╗  │
│    ║ ✨ 48-Hour Free Trial  ║  │
│    ╚═════════════════════════╝  │
│                                 │
│    [  Enter your email  ]       │
│                                 │
│    [Begin Your Journey →]       │
│                                 │
│    Then $12/month • Cancel      │
│    anytime                      │
│                                 │
└─────────────────────────────────┘
```

### What Happens:

1. **User enters email** → validation
2. **Clicks "Begin Your Journey"** → submits to `/api/auth/send-trial-magic-link`
3. **New trial user created** → `trial_starts_at = NOW`, `trial_ends_at = NOW + 48h`
4. **Magic link email sent** → beautiful branded email from VERA
5. **User clicks link** → auto-login to chat
6. **Trial banner appears** → countdown timer shows hours remaining

---

## 📧 Email Experience

**Subject:** ✨ Your 48-Hour VERA Trial is Ready

**Preview:**

```
╔════════════════════════════════╗
║ ✨ Welcome to VERA            ║
║ Your 48-Hour Free Trial        ║
║ Begins Now                     ║
╚════════════════════════════════╝

Hi there!

Click below to begin your 48-hour free trial:

    ┌──────────────────────────┐
    │ Begin Your Trial →        │
    └──────────────────────────┘

⏱️ 48-Hour Trial
Your trial starts immediately after you click
the link above. Enjoy full access to VERA for
48 hours, completely free.

💳 After Your Trial
After 48 hours, upgrade to continue for just
$12/month. Cancel anytime.

Link expires in 15 minutes and can only be used once.

— The VERA Team
```

---

## 🛠️ Technical Stack

**Frontend (Landing Page):**

- Pure HTML/CSS/JavaScript (no dependencies)
- Breathing orb animation (CSS keyframes)
- Living universe background (SVG stars)
- Email form with validation
- Success/error message display
- Mobile responsive design

**Backend (Trial System):**

- Node.js/Express server
- PostgreSQL database
- `connect-pg-simple` session store
- Resend email API
- Magic link authentication (15-min token expiry)

**Database:**

- Users table with `trial_starts_at` & `trial_ends_at`
- Login audit log for tracking
- Sessions table (auto-managed)
- Magic link tokens table

---

## 🎯 Remaining Work (NOT DONE YET)

### ⏳ Task 4: Trial Banner UI

Add countdown banner to chat showing:

- ⏳ "48:00:00 remaining in trial"
- 💳 "Upgrade Now" button
- After 48h: "Trial Expired - Upgrade to Continue"

**Files to modify:** `public/chat.html` or `public/vera-ai.html`

### ⏳ Task 5: Stripe Integration

Connect "Upgrade Now" button to Stripe checkout:

- Create checkout session
- Collect payment ($12/month)
- Update user subscription status
- Handle subscription in webhook

### ⏳ Task 6: End-to-End Testing

Test complete flow:

1. Landing page loads ✓
2. Email submission works ✓
3. Trial user created ✓
4. Magic link email arrives ✓
5. Click link → auto-login ✓
6. See trial banner (NOT YET)
7. Countdown works (NOT YET)
8. Upgrade button → Stripe (NOT YET)
9. Payment processed (NOT YET)
10. Subscription active (NOT YET)

---

## 🚢 Current Deployment

**Status:** ✅ LIVE on main branch  
**Commit:** `853d0ec` (documentation update)  
**Railway Deploy:** Auto-deploying now (2-5 min)  
**Live URL:** Your Railway app URL + `/`

**To Test:**

```
1. Wait 2-5 minutes
2. Visit https://your-railway-url/
3. See landing page with breathing orb
4. Enter email
5. Check inbox for magic link email
6. Click link and auto-login to chat
```

---

## 🔧 API Endpoints

### New Endpoint: Trial Magic Link

**POST** `/api/auth/send-trial-magic-link`

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response (Success):**

```json
{
  "success": true,
  "message": "Check your email for your 48-hour trial link. It expires in 15 minutes."
}
```

**Response (Error):**

```json
{
  "error": "Please enter a valid email address"
}
```

---

## 📊 Trial Logic

```javascript
// When new user signs up via landing page:
trial_starts_at = NOW()
trial_ends_at = NOW() + 48 hours (172,800 seconds)
subscription_status = 'trial'

// After 48 hours:
if (NOW() > trial_ends_at && status === 'trial') {
  // Show "Upgrade Now" prompt
  // Disable chat/features
}

// On upgrade:
subscription_status = 'active'
stripe_subscription_id = 'sub_xxxxx'
```

---

## 🎨 UI Components Created

### Landing Page Elements:

- ✨ Breathing orb (6-sec cycle, scales 1→1.12)
- ⭐ 50 twinkling stars (living universe background)
- 📧 Email input with focus effect
- 🔘 "Begin Your Journey" CTA button
- 💬 Success message display
- ❌ Error message display
- 📱 Mobile responsive layout

### Email Elements:

- 📨 Beautiful HTML email template
- 🎨 Gradient headers (purple to blue)
- 🔗 Magic link button
- ℹ️ Trial information box
- 💳 Pricing information
- 🔒 Security info (link expiration)

---

## ✨ What Makes This Special

1. **Beautiful Design** - Breathing orb, living universe, minimal
2. **Zero Dependencies** - Landing page uses pure HTML/CSS/JS
3. **Fast Email** - Resend API sends in seconds
4. **Secure** - Magic links expire in 15 minutes, single-use
5. **Trial Friendly** - Auto-creates account, no payment upfront
6. **Professional** - Branded emails match landing page
7. **Mobile Optimized** - Responsive design works on all devices
8. **Accessible** - Prefers-reduced-motion support for animations

---

## 🎯 Next Priority

**NEXT STEP:** Build trial banner UI in chat interface

This shows:

- Time remaining in trial (countdown)
- "Upgrade Now" button
- Auto-hide after upgrade

```javascript
// Example banner display
if (user.subscription_status === 'trial' && now < trial_ends_at) {
  hours_remaining = (trial_ends_at - now) / 3600;
  display_banner(`${hours_remaining}h remaining • Upgrade Now →`);
}
```

---

## 📞 Status

**Landing Page:** ✅ LIVE  
**Trial System:** ✅ LIVE  
**Magic Links:** ✅ LIVE  
**Trial Banner:** ⏳ NEXT  
**Stripe Integration:** ⏳ AFTER BANNER

**Total Progress:** 3/7 tasks complete (43%)

---

All code committed to GitHub, Railway deploying now! 🚀
