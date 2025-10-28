# Sentry Error Monitoring Setup - VERA

## ✅ Installation Complete

Your VERA app now has enterprise-grade error monitoring through Sentry.

---

## What Sentry Will Track

### Automatic Error Capture:

- ✅ **500 Errors** - Server crashes, unhandled exceptions
- ✅ **Database Errors** - Connection failures, query errors
- ✅ **Stripe Errors** - Payment failures, API issues
- ✅ **Authentication Errors** - Magic link failures, session issues
- ✅ **Claude API Errors** - Rate limits, timeouts, invalid responses
- ✅ **Performance Issues** - Slow requests, memory issues
- ✅ **Email Errors** - Resend/email delivery failures

### Manual Context (Added):

- Email addresses for auth events
- Payment details (priceId, source) for checkout issues
- All requests get tracked with timestamps

---

## How to View Errors in Sentry

1. **Go to your Sentry Dashboard:**
   - https://sentry.io (login with your account)
   - Select project: **VERA-Production**

2. **Main Dashboard:**
   - Shows all errors sorted by frequency
   - Color-coded by severity
   - Real-time updates

3. **Error Details:**
   - Click any error to see:
     - Stack trace (exact line in code)
     - User context (email affected)
     - Release version
     - Browser/OS info
     - Full request details

---

## Setting Up Email Alerts

### Option 1: Immediate Alerts (Best for Launch)

1. In Sentry dashboard, click **Alerts** (top menu)
2. Click **Create Alert**
3. Choose **Create Alert Rule**
4. Set conditions:
   - **When:** An event's level is error or higher
   - **If:** Happens more than 5 times
   - **Then:** Send email
5. Add your email: `your-email@gmail.com`
6. Save alert

### Option 2: Digest Summary (Daily)

1. Click **Alerts** → **Alert Settings**
2. Set digest frequency to **Daily**
3. Errors are batched and sent once per day

### Option 3: Advanced (High Priority Only)

1. Create alert for errors containing:
   - "STRIPE" → means payment failure
   - "DATABASE" → means data issue
   - "CLAUDE" → means AI response failed

---

## Next Steps After Launch

### First 24 Hours:

- ✅ Monitor for any new errors
- ✅ Check Sentry dashboard every few hours
- ✅ Test the alert emails work

### First Week:

- Fix any errors that appear
- Tune alert sensitivity if too many/few
- Document common errors

### Ongoing:

- Review Sentry weekly
- Set up "Release tracking" for deployments
- Monitor performance metrics

---

## Common Errors You Might See

| Error                 | Cause              | Solution                    |
| --------------------- | ------------------ | --------------------------- |
| `STRIPE_INVALID_KEY`  | Wrong Stripe key   | Check `.env.local`          |
| `DATABASE_CONNECTION` | DB down            | Check Railway status        |
| `RATE_LIMIT`          | Too many requests  | Check rate limiter settings |
| `TIMEOUT`             | Claude API slow    | Retry logic built-in        |
| `AUTH_FAILED`         | Magic link invalid | User needs new link         |

---

## Testing Sentry (Make Sure It Works)

To verify Sentry is capturing errors, you can manually trigger one:

```javascript
// In server.js terminal, run:
// curl http://localhost:8080/api/intentional-error

// Or add this route temporarily:
app.get('/api/test-sentry', (req, res) => {
  throw new Error('Test error - Sentry is working!');
});
```

This will:

1. Throw an error
2. Sentry captures it
3. Check your dashboard 2 seconds later
4. Error appears with full context

---

## Important Notes

### Production vs Development

- **Production:** All errors sent to Sentry
- **Development:** Errors NOT sent (to keep dashboard clean)
- Set `NODE_ENV=production` to send errors

### Privacy

- Sentry logs request data (headers, cookies, POST data)
- Email addresses are captured (from auth events)
- No personally identifiable data is logged
- All data encrypted in transit

### Cost

- **Free Tier:** Up to 5,000 events/month
- **Pricing:** $29/month for 100K events
- Typical SaaS uses 1-10K events/month
- No unexpected charges

---

## Debugging with Sentry

When an error happens, Sentry tells you:

1. **WHERE** it happened (file + line number)
2. **WHEN** it happened (exact timestamp)
3. **WHAT** the user was doing (context)
4. **WHY** it failed (error message + stack trace)

Example:

```
Error: Stripe API Error: Invalid API Key
Location: server.js line 1200
Time: Oct 27, 2025 2:34:15 PM
User: user@example.com
Request: POST /api/create-checkout-session
Context: priceId=price_1SMucpF8aJ0BDqA3asphVGOX
```

---

## Emergency Contact

If **Sentry itself** goes down:

- Check status: https://status.sentry.io
- Alternative: Check Railway logs directly
- Command: `npm run logs` (shows Railway links)

If **errors spike** dramatically:

1. Check Railway dashboard for infrastructure issues
2. Check Stripe status dashboard
3. Check Anthropic API status
4. Review recent code changes

---

## Next: Database Backups

Once you've confirmed Sentry is working, we'll set up automated database backups.

See: `DATABASE_BACKUP_SETUP.md` (coming next)
