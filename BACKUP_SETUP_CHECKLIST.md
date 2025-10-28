# DATABASE BACKUP SETUP CHECKLIST

## Immediate Setup (Before Launch)

### Step 1: Verify Railway's Automatic Backups ✓

- [ ] Go to https://railway.app
- [ ] Select VERA project → PostgreSQL plugin
- [ ] Go to Settings → Backups
- [ ] Confirm: "Automatic backups: Enabled"
- [ ] Note backup retention: should be 7 days

**Result:** Railway backs up your database daily automatically. ✓

---

### Step 2: Test Manual Backup Script

Run in your terminal:

```bash
npm run db:backup
```

Expected output:

```
🔄 Starting database backup...
📍 Database URL: postgresql://...
💾 Backup file: ./backups/vera-backup-2024-10-27T14-30-00.sql
✅ Backup completed successfully
📦 Backup size: 2.34 MB
```

- [ ] Command ran successfully
- [ ] Backup file created in `./backups/` directory
- [ ] File size is reasonable (1-5 MB)

**Result:** You can now create backups manually. ✓

---

### Step 3: Set Up Daily Automated Backups

Choose **ONE** option:

#### Option A: Railway Cron Jobs (Recommended)

- [ ] Go to Railway project settings
- [ ] Find "Cron Jobs" or "Jobs" section
- [ ] Create new job:
  - Name: `daily-backup`
  - Schedule: `0 3 * * *`
  - Command: `npm run db:backup`
- [ ] Enable the job
- [ ] Verify it shows as "Active"

**Result:** Backups run every day at 3am UTC automatically. ✓

#### Option B: Local Cron (If self-hosting)

If you're running on your own server:

```bash
# Edit crontab
crontab -e

# Add this line:
0 3 * * * cd /path/to/vera-project && npm run db:backup

# Save and verify:
crontab -l
```

**Result:** Backups run every day at 3am automatically. ✓

---

### Step 4: Test Backup Restoration (Optional but Recommended)

⚠️ **ONLY do this on staging/test, NOT production**

```bash
# List available backups
ls -lh backups/

# Restore from a backup
node scripts/restore-database.js ./backups/vera-backup-2024-10-27T03-00-00.sql

# Answer: "yes" to both confirmation prompts
```

Expected:

```
🔄 Starting database restore...
...
✅ Restore completed successfully
🔍 Verifying restored database...
✅ Database verification passed
```

- [ ] Script ran without errors
- [ ] Database was verified
- [ ] Data looks correct after restore

**Result:** You know how to restore if disaster happens. ✓

---

## Before Going Live

- [ ] Railway automatic backups verified (enabled)
- [ ] Manual backup script tested (`npm run db:backup`)
- [ ] Daily automated backups set up (3am schedule)
- [ ] Restore script tested (on staging)
- [ ] Documentation reviewed (see DATABASE_BACKUP_SETUP.md)
- [ ] Team knows backup location and procedures

---

## Post-Launch Monitoring

### Daily:

- [ ] App is running without errors
- [ ] No database errors in Sentry

### Weekly:

- [ ] Check backup sizes are consistent
- [ ] Review backup logs

### Monthly:

- [ ] Do full backup and restore test
- [ ] Document any issues

---

## What Gets Backed Up

✅ **YES:**

- All users
- All conversations and messages
- Payment records (Stripe)
- Session data
- All database tables

❌ **NO:**

- Code (use Git)
- Environment variables (.env.local)
- Uploaded files (store separately)

---

## Emergency Procedures

### Quick Restore (if disaster):

```bash
node scripts/restore-database.js ./backups/vera-backup-LATEST.sql
```

### Check backups exist:

```bash
ls -lh backups/
npm run db:backup  # Create fresh backup first
```

### View backup details:

```bash
file backups/vera-backup-*.sql
head -20 backups/vera-backup-*.sql
```

---

## Key Documents

📄 **See for details:**

- `DATABASE_BACKUP_SETUP.md` - Full backup guide
- `scripts/backup-database.js` - Backup script
- `scripts/restore-database.js` - Restore script

---

## Support

**Issue:** Backup says "pg_dump not found"

- Solution: Install PostgreSQL client tools

**Issue:** Restore fails

- Solution: Check DATABASE_PUBLIC_URL in .env.local

**Issue:** Old backups aren't being deleted

- Solution: Check backups directory permissions

---

## You're Protected! ✓

Your database now has **3 layers of backup:**

1. ✅ Railway automatic daily backups
2. ✅ Manual backup scripts (daily scheduled)
3. ✅ Point-in-time recovery (Railway)

**You're ready to launch safely!**

Check the box when complete:

- [ ] Backup setup verified and tested
