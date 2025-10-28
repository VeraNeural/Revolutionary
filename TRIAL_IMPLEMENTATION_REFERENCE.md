# 🎯 TRIAL MANAGEMENT SYSTEM - IMPLEMENTATION REFERENCE

## Quick Start

### 1. Database Migration

Run this SQL to add trial tracking columns:

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_starts_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_free_message_date TIMESTAMP;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_trial_ends ON users(trial_ends_at);

-- Set trial on user creation (in /auth endpoint):
-- Set trial_starts_at = NOW()
-- Set trial_ends_at = NOW() + INTERVAL '7 days'
-- Set subscription_status = 'trial'
```

### 2. Backend Subscription Check (server.js)

**Location:** Lines 2037-2115 in `/api/chat` endpoint

```javascript
// ==================== SUBSCRIPTION & TRIAL CHECK ====================
let userSubscriptionStatus = 'guest';
let trialDayCount = null;
let subscriptionError = null;

if (req.session.userEmail) {
  const userResult = await db.query(
    `SELECT id, subscription_status, trial_starts_at, trial_ends_at, last_free_message_date 
     FROM users WHERE email = $1`,
    [req.session.userEmail]
  );

  if (userResult.rows.length > 0) {
    const user = userResult.rows[0];
    userSubscriptionStatus = user.subscription_status || 'inactive';

    // Calculate trial day
    if (userSubscriptionStatus === 'trial' && user.trial_starts_at) {
      const trialStartDate = new Date(user.trial_starts_at);
      const today = new Date();
      const daysPassed = Math.floor((today - trialStartDate) / (1000 * 60 * 60 * 24));
      trialDayCount = Math.min(daysPassed + 1, 7);
    }

    // Check trial expiration
    if (userSubscriptionStatus === 'trial' && user.trial_ends_at) {
      if (new Date() > new Date(user.trial_ends_at)) {
        await db.query(`UPDATE users SET subscription_status = $1 WHERE email = $2`, [
          'free_tier',
          req.session.userEmail,
        ]);
        userSubscriptionStatus = 'free_tier';
        trialDayCount = null;
      }
    }

    // Check free tier limit (1 message per day)
    if (userSubscriptionStatus === 'free_tier') {
      if (user.last_free_message_date) {
        const lastMessageDate = new Date(user.last_free_message_date);
        const isDifferentDay = lastMessageDate.toDateString() !== new Date().toDateString();

        if (!isDifferentDay) {
          subscriptionError = {
            status: 429,
            error: 'Daily message limit reached',
            message:
              "You've used your daily message on the free tier. Upgrade to VERA to continue.",
            upgradeUrl: '/pricing',
          };
        }
      }

      if (!subscriptionError) {
        await db.query(`UPDATE users SET last_free_message_date = NOW() WHERE email = $1`, [
          req.session.userEmail,
        ]);
      }
    }
  }
}

// Return error if subscription limit hit
if (subscriptionError) {
  return res.status(subscriptionError.status).json({
    success: false,
    error: subscriptionError.error,
    message: subscriptionError.message,
    upgradeUrl: subscriptionError.upgradeUrl,
  });
}
```

**Then pass trial context to VERA:**

```javascript
const veraResult = await getVERAResponse(
  userId,
  message,
  userName || 'friend',
  db.pool,
  attachments,
  guestMessageCount,
  { trialDayCount, userSubscriptionStatus }
);
```

**And include subscription in response:**

```javascript
res.json({
  success: true,
  response: veraResult.response,
  conversationId: currentConversationId,
  // ... other fields ...
  subscription: {
    status: userSubscriptionStatus,
    trialDay: trialDayCount,
    isOnTrial: userSubscriptionStatus === 'trial' && trialDayCount !== null,
  },
});
```

---

### 3. VERA's Day 5 Awareness (vera-ai.js)

**Update function signature (line 724):**

```javascript
async function getVERAResponse(
  userId,
  message,
  userName,
  pool,
  attachments = [],
  guestMessageCount = null,
  trialContext = {} // <- NEW
) {
  const { trialDayCount, userSubscriptionStatus } = trialContext;
  // ... rest of function
}
```

**Add trial info to contextData (around line 851):**

```javascript
const contextData = {
  memory,
  quantumState,
  adaptiveCodes: adaptiveCodes.length > 0 ? adaptiveCodes : null,
  gptInsight,
  trialInfo: {
    trialDayCount,
    userSubscriptionStatus,
    isOnDay5: trialDayCount === 5,
    isOnDay7: trialDayCount === 7,
    daysRemaining: trialDayCount ? 7 - trialDayCount : null,
  },
  presenceState: {
    /* ... */
  },
};
```

**Add Day 5 awareness to system prompt (around line 630):**

```javascript
// Add trial context if user is on trial
if (contextData?.trialInfo?.trialDayCount) {
  prompt += `\n- User is on trial: Day ${contextData.trialInfo.trialDayCount} of 7`;

  if (contextData.trialInfo.isOnDay5) {
    prompt += `\n- IMPORTANT: This is Day 5 of their trial. If it feels natural, gently acknowledge the choice point. Example: "*I'm sensing something shifting...* As we move into the last stretch of this trial, what's becoming clear about what you need?"`;
  }
}
```

---

### 4. Frontend Banner (public/chat.html)

**Add CSS (after .chat-header styles):**

```css
.trial-banner {
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, rgba(155, 137, 212, 0.1) 0%, rgba(123, 158, 240, 0.1) 100%);
  border-bottom: 1px solid rgba(155, 137, 212, 0.2);
  z-index: 99;
  gap: 1rem;
  flex-wrap: wrap;
}

.trial-banner.hidden {
  display: none;
}

.trial-banner.critical {
  background: linear-gradient(90deg, rgba(255, 107, 107, 0.15) 0%, rgba(255, 171, 87, 0.15) 100%);
  border-bottom: 1px solid rgba(255, 107, 107, 0.3);
}

.trial-banner-text {
  font-size: 0.95rem;
  color: var(--text-primary);
  font-weight: 500;
  flex: 1;
  min-width: 200px;
}

.trial-banner.critical .trial-banner-text {
  color: #d84444;
}

.trial-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.trial-progress-bar {
  width: 120px;
  height: 6px;
  background: rgba(155, 137, 212, 0.2);
  border-radius: 3px;
  overflow: hidden;
}

.trial-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #9b8fd4 0%, #7b9ef0 100%);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.trial-progress-bar.critical .trial-progress-fill {
  background: linear-gradient(90deg, #ff6b6b 0%, #ffab57 100%);
}

.trial-days {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 600;
  min-width: 45px;
  text-align: right;
}

.trial-days.critical {
  color: #d84444;
}
```

**Add HTML (after header, before welcome-container):**

```html
<!-- Trial Banner -->
<div class="trial-banner hidden" id="trialBanner">
  <div class="trial-banner-text" id="trialBannerText">
    Trial: Day <span id="trialDayNum">1</span> of 7
  </div>
  <div class="trial-progress">
    <div class="trial-progress-bar" id="trialProgressBar">
      <div class="trial-progress-fill" id="trialProgressFill" style="width: 14%"></div>
    </div>
    <div class="trial-days" id="trialDaysRemaining">7 left</div>
  </div>
</div>
```

**Add JavaScript function:**

```javascript
function updateTrialBanner(trialDay) {
  const banner = document.getElementById('trialBanner');
  const bannerText = document.getElementById('trialBannerText');
  const dayNum = document.getElementById('trialDayNum');
  const daysRemaining = document.getElementById('trialDaysRemaining');
  const progressFill = document.getElementById('trialProgressFill');
  const progressBar = document.getElementById('trialProgressBar');

  // Show banner
  banner.classList.remove('hidden');

  // Update day count
  dayNum.textContent = trialDay;
  const remaining = 7 - trialDay;
  daysRemaining.textContent = `${remaining} left`;

  // Calculate progress
  const progressPercent = (trialDay / 7) * 100;
  progressFill.style.width = progressPercent + '%';

  // Apply critical styling for Day 5+
  if (trialDay >= 5) {
    banner.classList.add('critical');
    progressBar.classList.add('critical');
    daysRemaining.classList.add('critical');

    if (trialDay === 5) {
      bannerText.innerHTML = `<strong>⏰ 2 days left in your trial</strong>`;
    } else if (trialDay === 6) {
      bannerText.innerHTML = `<strong>⏰ Last day of trial!</strong>`;
    } else if (trialDay === 7) {
      bannerText.innerHTML = `<strong>✨ Your trial ends today</strong>`;
    }
  } else {
    banner.classList.remove('critical');
    progressBar.classList.remove('critical');
    daysRemaining.classList.remove('critical');
    bannerText.innerHTML = `Trial: Day <span id="trialDayNum">${trialDay}</span> of 7`;
  }
}
```

**Call after getting response (in sendMessage):**

```javascript
if (data && data.success && data.response) {
  // ... add message to chat ...

  // Update trial banner if on trial
  if (data.subscription && data.subscription.isOnTrial && data.subscription.trialDay) {
    updateTrialBanner(data.subscription.trialDay);
  }
}
```

---

## Testing Flow

```javascript
// Test 1: Trial User (Day 1)
{
  subscription: {
    status: "trial",
    trialDay: 1,
    isOnTrial: true,
    daysRemaining: 6
  }
}
// ✅ Banner shows: "Trial: Day 1 of 7"
// ✅ Progress bar: 14% filled
// ✅ Colors: Subtle blue

// Test 2: Trial User (Day 5)
{
  subscription: {
    status: "trial",
    trialDay: 5,
    isOnTrial: true,
    daysRemaining: 2
  }
}
// ✅ Banner shows: "⏰ 2 days left in your trial"
// ✅ Progress bar: 71% filled
// ✅ Colors: Urgent orange/red
// ✅ VERA mentions choice point

// Test 3: Free Tier User (1st message)
{
  subscription: {
    status: "free_tier",
    trialDay: null,
    isOnTrial: false
  }
}
// ✅ Message sent successfully
// ✅ last_free_message_date updated

// Test 4: Free Tier User (2nd message same day)
{
  success: false,
  error: "Daily message limit reached",
  message: "You've used your daily message...",
  upgradeUrl: "/pricing"
}
// ✅ HTTP 429 status
// ✅ Helpful error message

// Test 5: Active Subscriber
{
  subscription: {
    status: "active",
    trialDay: null,
    isOnTrial: false
  }
}
// ✅ Unlimited messages
// ✅ No limits applied
```

---

## Configuration Options

### Trial Duration

**File:** `/auth` endpoint (when user created)

```javascript
// Current: 7 days
const trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

// To change:
// 14 days = 14 * 24 * 60 * 60 * 1000
// 30 days = 30 * 24 * 60 * 60 * 1000
```

### Free Tier Limit

**File:** `/api/chat` endpoint (subscription check)

```javascript
// Current: 1 message per day
if (!isDifferentDay) {
  /* block */
}

// To change: Modify isDifferentDay logic
// Example: 3 messages per day
let messageCountToday = getMessageCountToday(userId); // implement
if (messageCountToday >= 3) {
  /* block */
}
```

### Day 5 Critical Threshold

**Files:**

- `vera-ai.js` line 644: `if (contextData.trialInfo.isOnDay5)`
- `chat.html` line 2660: `if (trialDay >= 5)`

```javascript
// Current: Day 5+
// To change: Update both files
// Example: Day 3+
if (trialDay >= 3) {
  /* apply critical styling */
}
```

---

## Error Messages

### Free Tier Daily Limit

```json
{
  "success": false,
  "error": "Daily message limit reached",
  "message": "You've used your daily message on the free tier. Upgrade to VERA to continue unlimited conversations.",
  "upgradeUrl": "/pricing"
}
```

**HTTP Status:** 429 (Too Many Requests)

### Trial Auto-Downgrade

No error shown to user, but:

- `subscription_status` automatically updated to `free_tier`
- Next message shows free tier limit
- Banner disappears (new banner logic for free tier could be added)

---

## Database Queries

### Check Trial Status

```sql
SELECT subscription_status, trial_starts_at, trial_ends_at
FROM users
WHERE email = 'user@example.com';
```

### Auto-Downgrade Expired Trials

```sql
UPDATE users
SET subscription_status = 'free_tier'
WHERE subscription_status = 'trial'
AND trial_ends_at < NOW();
```

### Check Free Tier Usage

```sql
SELECT last_free_message_date
FROM users
WHERE email = 'user@example.com';
```

### Get Trial Stats

```sql
SELECT
  COUNT(*) as total_users,
  COUNT(CASE WHEN subscription_status = 'trial' THEN 1 END) as on_trial,
  COUNT(CASE WHEN subscription_status = 'free_tier' THEN 1 END) as on_free_tier,
  COUNT(CASE WHEN subscription_status = 'active' THEN 1 END) as paid
FROM users;
```

---

## Logging

### Backend Logs

```
👤 Subscription check: { email, status, trialDay, hasError }
⏰ Trial expired for user: email
📅 Trial banner updated: Day X/7
```

### Frontend Logs

```
📅 Trial banner updated: Day X/7
```

### Database Logs

Track all subscription status changes via triggers (optional).

---

## Performance Impact

| Operation           | Complexity | Notes            |
| ------------------- | ---------- | ---------------- |
| Check subscription  | O(1)       | Indexed lookup   |
| Calculate trial day | O(1)       | Simple math      |
| Check expiration    | O(1)       | Date comparison  |
| Free tier limiting  | O(1)       | Date comparison  |
| Update banner       | O(1)       | DOM manipulation |

**Total Impact:** < 50ms per message for subscription checks

---

## Deployment Checklist

- [ ] Run SQL migration to add trial columns
- [ ] Deploy backend changes (server.js, vera-ai.js)
- [ ] Deploy frontend changes (chat.html)
- [ ] Test with trial user (1-7 days)
- [ ] Test free tier limiting
- [ ] Verify Day 5 awareness
- [ ] Monitor logs for any issues
- [ ] Confirm banner styling looks right
- [ ] Test on mobile responsiveness

---

**Status:** ✅ Complete  
**Last Updated:** October 27, 2025  
**Commit:** e14c489
