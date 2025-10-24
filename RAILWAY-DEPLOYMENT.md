# VERA Deployment Guide - Railway

## Your server is ready for deployment! 🚀

Your `server.js` now:
- ✅ Serves static files from `public/`
- ✅ Has all API endpoints (`/api/chat`, `/api/subscription-status`, `/api/portal`, etc.)
- ✅ Uses the modular `getVERAResponse` with attachment support
- ✅ Connects to Neon PostgreSQL
- ✅ Integrates with Stripe

Your frontend (`public/chat.html`):
- ✅ Updated to call `/api/*` endpoints (no more Netlify paths)

---

## Option 1: Railway (Recommended)

### Step 1: Push to GitHub

```powershell
# Initialize Git if not already done
git init
git add .
git commit -m "Unified VERA server ready for Railway"

# Push to your GitHub repo
git remote add origin https://github.com/YOUR_USERNAME/vera-project.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `vera-project` repository
4. Railway will auto-detect Node.js and use `npm start`

### Step 3: Configure Environment Variables

In Railway dashboard → your project → **Variables** tab, add:

```
DATABASE_URL=postgresql://user:pass@host/db
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
SESSION_SECRET=your-random-secret-key-here
APP_URL=https://your-app.railway.app
PORT=8080
NODE_ENV=production
```

**Get your Railway URL:**
- Railway assigns a URL like `vera-project-production-abc123.up.railway.app`
- Copy this and set `APP_URL` to it

### Step 4: Update Stripe Webhook

1. Go to Stripe Dashboard → **Developers** → **Webhooks**
2. Update your webhook endpoint to:
   ```
   https://your-app.railway.app/webhook
   ```
3. Make sure these events are enabled:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

### Step 5: Point Your Domain

In Railway:
1. Go to **Settings** → **Domains**
2. Click **"Generate Domain"** or **"Custom Domain"**
3. Add `app.veraneural.com`

In your DNS (Namecheap/Cloudflare):
1. Add a **CNAME** record:
   - **Host:** `app` (or `@` for root domain)
   - **Value:** `your-app.railway.app` (from Railway)
   - **TTL:** Automatic/3600

DNS propagation takes 5-60 minutes.

### Step 6: Test Your Deployment

```powershell
# Health check
curl https://app.veraneural.com/health

# API test
curl https://app.veraneural.com/api/test

# Open in browser
start https://app.veraneural.com
```

---

## Option 2: Render

### Step 1: Push to GitHub (same as above)

### Step 2: Deploy to Render

1. Go to [render.com](https://render.com) and sign in with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your `vera-project` repo
4. Configure:
   - **Name:** `vera-neural`
   - **Branch:** `main`
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Plan:** Free (or paid for production)

### Step 3: Environment Variables

In Render dashboard → **Environment** tab:

```
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
SESSION_SECRET=your-secret
APP_URL=https://vera-neural.onrender.com
PORT=8080
NODE_ENV=production
```

### Step 4: Custom Domain

In Render:
1. Go to **Settings** → **Custom Domain**
2. Add `app.veraneural.com`
3. Follow DNS instructions (similar to Railway)

---

## Auto-Deploy from Git

Both Railway and Render auto-deploy when you push to `main`:

```powershell
# Make changes
git add .
git commit -m "Update feature"
git push origin main

# Railway/Render will automatically build and deploy
```

---

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string | `postgresql://user:pass@ep-...neon.tech/db?sslmode=require` |
| `STRIPE_SECRET_KEY` | Stripe secret API key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `whsec_...` |
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-...` |
| `OPENAI_API_KEY` | Optional GPT-4 key | `sk-...` |
| `SESSION_SECRET` | Express session secret | Random 32+ char string |
| `APP_URL` | Your production URL | `https://app.veraneural.com` |
| `PORT` | Server port (usually 8080) | `8080` |
| `NODE_ENV` | Environment mode | `production` |

---

## What About Netlify?

You have two choices:

### Option A: Retire Netlify Completely
- Point `app.veraneural.com` to Railway/Render
- Your server handles both static files AND API
- Delete `netlify/` folder and `netlify.toml`

### Option B: Keep Netlify for Static + Proxy to Railway API
If you want to keep Netlify hosting the static files:

1. Update `netlify.toml`:
```toml
[build]
  publish = "public"

[[redirects]]
  from = "/api/*"
  to = "https://app.veraneural.com/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 404
```

2. Keep frontend on Netlify
3. Point API calls through the proxy to your Railway/Render server

**I recommend Option A** (retire Netlify) for simplicity—one service, one deploy, one URL.

---

## Testing Checklist

After deployment:

- [ ] Visit `https://app.veraneural.com` - landing page loads
- [ ] Click orb, enter name, navigate to chat
- [ ] Send a message - VERA responds
- [ ] Check conversation history persists
- [ ] Test subscription flow (Stripe checkout)
- [ ] Verify webhook is receiving Stripe events
- [ ] Check server logs in Railway/Render dashboard

---

## Monitoring & Logs

**Railway:**
- Dashboard → your project → **Deployments** → Click latest build → **View Logs**

**Render:**
- Dashboard → your service → **Logs** tab

Watch for:
- `✅ DATABASE CONNECTED SUCCESSFULLY`
- `🧠 Calling getVERAResponse...`
- `✅ VERA result: ...`
- Any `❌` errors

---

## Need Help?

1. Check Railway/Render logs for errors
2. Verify all environment variables are set
3. Test each endpoint individually with curl/Postman
4. Check Stripe webhook logs in Stripe dashboard

Your server is production-ready! 🎉
