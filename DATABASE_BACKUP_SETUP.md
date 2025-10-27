# Database Backup & Disaster Recovery - VERA

## Overview

Your VERA database is protected by **three layers of backup**:

1. ✅ **Railway's Built-In Backups** (Automatic, daily)
2. ✅ **Local Backup Scripts** (Manual or scheduled)
3. ✅ **Point-in-Time Recovery** (Via Railway)

---

## LAYER 1: Railway's Built-In Backups

### How It Works:
- Railway automatically backs up your PostgreSQL database **every 24 hours**
- Keeps backups for **7 days**
- Stored on Railway's secure servers
- **Zero configuration needed**

### Where to Find Them:
1. Go to **https://railway.app**
2. Select your VERA project
3. Click on **PostgreSQL** plugin (not main deployment)
4. Go to **Settings** tab
5. Look for **Backups** section

### How to Restore from Railway:
1. In Railway PostgreSQL settings
2. Click **Restore from backup**
3. Select the date you want
4. Confirm (⚠️ This replaces your database!)
5. Wait 5-10 minutes for restore to complete

### Pros & Cons:
| Pro | Con |
|-----|-----|
| Automatic, no setup | Limited to 7 days |
| Always available | No local copy |
| Easy one-click restore | Can't preview data |
| Included with Railway | Requires Railway access |

---

## LAYER 2: Local Backup Scripts

### Creating Manual Backups:

**Run this command:**
```bash
npm run db:backup
```

Or directly:
```bash
node scripts/backup-database.js
```

**What happens:**
1. Creates a timestamped SQL file: `backups/vera-backup-2024-10-27T14-30-00.sql`
2. Includes ALL tables, data, indexes
3. File size: ~1-5 MB (compressed data)
4. Backup retained for 7 days, old ones auto-deleted

### Automated Backups (Daily at 3am):

#### Option A: Using Node-Cron (Recommended)

Create `scripts/scheduled-backups.js`:
```javascript
const cron = require('node-cron');
const { spawn } = require('child_process');

// Run backup at 3:00 AM every day
cron.schedule('0 3 * * *', () => {
  console.log('🔄 Running scheduled backup...');
  spawn('node', ['scripts/backup-database.js']);
});

console.log('✅ Scheduled backup running (daily at 3am UTC)');
```

Run with:
```bash
node scripts/scheduled-backups.js
```

Or add to Railway's Cron Jobs (see below).

#### Option B: Railway Cron Jobs

1. Go to Railway project settings
2. Look for "Cron" or "Jobs" section
3. Create new job:
   - **Name:** `daily-backup`
   - **Schedule:** `0 3 * * *` (3am UTC)
   - **Command:** `npm run db:backup`

#### Option C: External Cron Service

Use a service like **EasyCron** or **cron-job.org**:
1. Create new scheduled job
2. URL: `https://app.veraneural.com/api/backup`
3. Run at: `0 3 * * *`
4. Add API endpoint to server.js to handle backups

### Viewing Backups:

```bash
ls -lh backups/
```

Shows:
```
vera-backup-2024-10-27T14-30-00.sql    2.3M    Oct 27
vera-backup-2024-10-26T03-00-00.sql    2.2M    Oct 26
vera-backup-2024-10-25T03-00-00.sql    2.1M    Oct 25
```

---

## LAYER 3: Restoring from Local Backup

### When You Need to Restore:

```
- Data corruption
- Accidental deletion
- Security breach
- Major bug introduced
- Rollback to known good state
```

### How to Restore:

**Step 1: Stop your app**
```bash
# On Railway, pause the deployment
# Or locally: Ctrl+C to stop server
```

**Step 2: Run restore script**
```bash
node scripts/restore-database.js ./backups/vera-backup-2024-10-27T14-30-00.sql
```

**Step 3: Answer confirmation prompts**
```
Are you ABSOLUTELY SURE? (yes/no): yes
Last chance! Type "yes" again: yes
```

**Step 4: Wait for restore to complete**
```
🔄 Starting database restore...
📁 Backup file: ./backups/vera-backup-2024-10-27T14-30-00.sql
...
✅ Restore completed successfully
```

**Step 5: Restart your app**
```bash
npm start
# Or redeploy on Railway
```

**Step 6: Verify data**
- Check user accounts exist
- Verify recent messages
- Test key features

---

## What Gets Backed Up

✅ **Backed up:**
- All users and authentication data
- All conversations and messages
- Stripe subscription records
- Session data
- Crisis alerts
- All tables and indexes

❌ **NOT backed up:**
- Environment variables (.env.local)
- Uploaded files (if any)
- Code (use Git for that)
- Third-party API data

---

## Disaster Recovery Playbook

### Scenario 1: Accidental Data Deletion

1. **When:** Just discovered data deleted
2. **Action:** 
   - Backup most recent backup: `backups/vera-backup-2024-10-27T03-00-00.sql`
   - Restore immediately
3. **Time to restore:** 5-15 minutes
4. **Data loss:** None (most recent backup)

### Scenario 2: Database Corruption

1. **When:** Getting `database connection errors`
2. **Action:**
   - Restore from backup
   - Contact Railway support
3. **Time to restore:** 10-20 minutes
4. **Data loss:** Up to 24 hours (last backup)

### Scenario 3: Security Breach

1. **When:** Detected unauthorized access
2. **Action:**
   - Restore clean backup from before breach
   - Change all credentials
   - Update security
   - Deploy new version
3. **Time to restore:** 20-30 minutes
4. **Data loss:** Varies (choose most recent safe backup)

### Scenario 4: Major Bug Introduced

1. **When:** New code breaks everything
2. **Action:**
   - Restore database to state before bug
   - Revert code deployment
   - Test locally
   - Redeploy fixed version
3. **Time to restore:** 15-25 minutes
4. **Data loss:** None (database unchanged during bug)

---

## Testing Your Backups

### Monthly Backup Test:

1. **Create a test database** (separate from production)
2. **Restore a backup** to the test database
3. **Verify all data** looks correct
4. **Document results**

This ensures backups actually work when you need them!

---

## Best Practices

### Daily Checklist:
- ✅ Monitor app is running
- ✅ Check for errors in Sentry
- ✅ Verify backups are created

### Weekly:
- ✅ Review backup sizes (should be similar)
- ✅ Test one restore to staging
- ✅ Check Railway backup logs

### Monthly:
- ✅ Full backup and restore test
- ✅ Document any issues
- ✅ Update disaster recovery plan

### Quarterly:
- ✅ Review and update this documentation
- ✅ Test with larger backups
- ✅ Train team on restore procedures

---

## Troubleshooting

### Backup fails with "pg_dump not found"

PostgreSQL tools aren't installed:
```bash
# macOS
brew install postgresql

# Ubuntu/Debian
sudo apt-get install postgresql-client

# Windows
# Download from: https://www.postgresql.org/download/windows/
```

### Restore fails: "Role does not exist"

The backup includes role data that conflicts. Solution:
1. Edit the backup SQL file
2. Find and remove `CREATE ROLE` commands
3. Try restore again

### Backup file is huge (>100MB)

Probably has lots of message history. This is normal. To compress:
```bash
gzip backups/vera-backup-*.sql
```

### How often should I back up?

- **Minimum:** 1x per day (Railway does this automatically)
- **Recommended:** 3-4x per day (if high data volume)
- **Enterprise:** Continuous (paid solutions)

For VERA: 1x daily is probably fine for launch phase.

---

## Emergency Contacts

**If something breaks:**

1. **Check status pages:**
   - Railway: https://status.railway.app
   - Stripe: https://status.stripe.com
   - Anthropic: Check their status page

2. **Access logs:**
   ```bash
   npm run logs
   # Shows Railway dashboard links
   ```

3. **Quick restore:**
   ```bash
   node scripts/restore-database.js ./backups/vera-backup-LATEST.sql
   ```

---

## Next Steps

1. ✅ Verify Railway backups are enabled
2. ✅ Test manual backup: `npm run db:backup`
3. ✅ Set up daily automated backups
4. ✅ Document your backup locations
5. ✅ Test a restore once (on staging)
6. ✅ Monitor backup sizes weekly

**Backups are your safety net. Test them before you need them!**
