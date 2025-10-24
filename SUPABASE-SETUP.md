# 🗄️ Supabase Setup for VERA Neural (5 Minutes)

## Why Supabase?

- PostgreSQL (your server.js already uses it)
- Free tier: 500MB database, unlimited requests
- Easy dashboard
- Just copy connection string → Done

---

## 📋 Step-by-Step Setup

### **1. Create Supabase Account** (2 min)

1. Go to: https://supabase.com/
2. Sign up (free)
3. Click "New Project"
4. Fill in:
   - **Name:** vera-neural
   - **Database Password:** (save this!)
   - **Region:** Choose closest to you
5. Click "Create new project"
6. Wait 2 minutes for it to spin up

### **2. Get Your Connection String** (1 min)

1. In Supabase dashboard, click "Project Settings" (⚙️ icon bottom left)
2. Click "Database" in left menu
3. Scroll to "Connection string"
4. Copy the **"URI"** format (looks like this):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the password you created

### **3. Add to Your .env.local** (30 sec)

```bash
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
```

### **4. Import Database Schema** (1 min)

1. In Supabase dashboard, click "SQL Editor" (left menu)
2. Click "New Query"
3. Copy/paste the entire contents of `database-schema.sql`
4. Click "Run"
5. You should see: "Success. No rows returned"

✅ **Done!** Your database is ready.

---

## 🧪 Test It Works

Run your backend locally:

```bash
cd your-backend-folder
npm install
npm start
```

You should see:
```
✅ VERA REVOLUTIONARY SYSTEM ONLINE
✨ Server listening on port 8080
🔗 Local: http://localhost:8080
```

If you see errors about database connection, check:
- Password is correct in DATABASE_URL
- Connection string copied correctly
- Supabase project is running (check dashboard)

---

## 📊 View Your Data

Anytime you want to see your database:
1. Go to Supabase dashboard
2. Click "Table Editor" (left menu)
3. See all your tables: users, messages, crisis_alerts, etc.

---

## 🔒 Security Notes

**Your DATABASE_URL contains sensitive info:**
- Never commit to git (it's in .gitignore already ✅)
- Never share publicly
- Each environment (local, production) should have its own

---

## 🚀 For Production (Railway)

When you deploy to Railway:
1. Go to Railway project
2. Click "Variables"
3. Add: `DATABASE_URL = your_supabase_connection_string`
4. Done!

Railway will use Supabase as the database.

**Alternative:** Railway can also create its own PostgreSQL database. Choose one:
- **Supabase:** Better dashboard, more features
- **Railway PostgreSQL:** All-in-one, simpler

---

## 💡 Pro Tips

**Backup your database:**
- Supabase dashboard → Database → Backups
- Free tier: 7-day backups included

**Monitor usage:**
- Dashboard → Reports
- See API calls, database size, bandwidth

**Connection pooling:**
If you get "too many connections" errors later:
- Supabase dashboard → Database → Connection pooling
- Use the "Connection pooling" URI instead

---

## 🆘 Troubleshooting

**"password authentication failed"**
→ Check your password in the connection string

**"could not connect to server"**
→ Check Supabase project is running (dashboard should be green)

**"database does not exist"**
→ Make sure you're using the right connection string (URI format)

**"SSL required"**
→ Add `?sslmode=require` to end of DATABASE_URL

---

## ✅ You're Ready!

Database is set up. Now VERA can:
- Store user accounts
- Save conversation history
- Track subscriptions
- Monitor crisis alerts
- Handle sessions

**Next:** Test the Stripe integration! 🎯