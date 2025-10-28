# 🚀 Deploy VERA to Railway in 5 Minutes

## Step 1: Push to GitHub (1 min)

```powershell
git add .
git commit -m "VERA unified server ready for deployment"
git push origin main
```

## Step 2: Create Railway Project (2 min)

1. Go to **[railway.app](https://railway.app)**
2. Sign in with GitHub
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose `vera-project`
6. Railway auto-detects Node.js and runs `npm start`

## Step 3: Add Environment Variables (2 min)

In Railway dashboard → **Variables** tab:

```bash
DATABASE_URL=your-neon-postgres-url
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ANTHROPIC_API_KEY=sk-ant-...
SESSION_SECRET=generate-random-32-chars
APP_URL=https://vera-project-production.up.railway.app
PORT=8080
NODE_ENV=production
```

**Get your Railway URL:** Railway assigns something like `vera-project-production-abc123.up.railway.app` - copy this for `APP_URL`

## Step 4: Update Stripe Webhook (30 sec)

1. Stripe Dashboard → **Developers** → **Webhooks**
2. Update endpoint URL to: `https://your-railway-url.railway.app/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`

## Step 5: Point Your Domain (Optional)

Railway dashboard → **Settings** → **Custom Domain**:

- Add `app.veraneural.com`
- Railway gives you CNAME target

In your DNS:

- **Type:** CNAME
- **Name:** `app`
- **Value:** `your-app.railway.app`

---

## ✅ Done! Test Your Deployment

```powershell
# Health check
curl https://your-railway-url.railway.app/health

# Open in browser
start https://your-railway-url.railway.app
```

---

## Auto-Deploy on Every Push

Railway watches your `main` branch:

```powershell
# Make changes
git add .
git commit -m "Update feature"
git push origin main
# Railway automatically rebuilds & deploys
```

---

## View Logs

Railway dashboard → your project → **Deployments** → Latest → **View Logs**

Look for:

- `✅ DATABASE CONNECTED SUCCESSFULLY`
- `🧠 Calling getVERAResponse...`
- `✅ VERA result: ...`

---

## Need More Details?

See **`RAILWAY-DEPLOYMENT.md`** for:

- Full environment variable reference
- Alternative: Render deployment
- Custom domain setup
- Troubleshooting

---

**That's it!** Your VERA server is live and managed through Git. 🎉
