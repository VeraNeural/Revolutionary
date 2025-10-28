# Migration Script Documentation

## Overview

The `run-migrations.js` script automatically runs database migrations from `DATABASE_MIGRATIONS.sql` on your Railway database. It's designed to be:

- **Idempotent**: Safe to run multiple times
- **Graceful**: Handles "already exists" errors
- **Observable**: Clear logging with emoji indicators
- **Automated**: Runs automatically on server startup in production

---

## How It Works

### Automatic (On Server Startup)

1. When `server.js` starts in production (when `DATABASE_URL` is set):
   - Migrations are run automatically before the server starts listening
   - Each migration is logged with progress indicators
   - Failures don't block server startup (non-blocking)
   - Skipped migrations (already exist) are logged as warnings

2. When running locally (no `DATABASE_URL`):
   - Migrations are skipped
   - Server starts normally
   - Local SQLite/test database is used

### Manual Execution

Run migrations manually at any time:

```bash
# Using your Railway DATABASE_URL
node run-migrations.js

# Or explicitly with environment variable
DATABASE_URL="postgresql://user:pass@host:port/db" node run-migrations.js
```

---

## Usage

### Option 1: Manual Execution (Development/Testing)

Set up your DATABASE_URL and run:

```bash
# Set the environment variable
export DATABASE_URL="postgresql://your-user:your-password@localhost:5432/vera"

# Run migrations
node run-migrations.js
```

**On Windows PowerShell:**

```powershell
$env:DATABASE_URL = "postgresql://your-user:your-password@localhost:5432/vera"
node run-migrations.js
```

### Option 2: Automatic on Server Startup (Production)

When you deploy to Railway, migrations run automatically:

1. Railway sets `DATABASE_URL` environment variable
2. `server.js` starts
3. `runDatabaseMigrations()` is called
4. Migrations run sequentially
5. Server starts listening

No additional action needed - just deploy normally with `git push origin main`

### Option 3: In package.json Scripts (Optional)

You can add to `package.json` for convenience:

```json
{
  "scripts": {
    "migrate": "node run-migrations.js",
    "migrate:check": "node run-migrations.js",
    "start": "node server.js"
  }
}
```

Then run with:

```bash
npm run migrate
```

---

## Output Examples

### Successful Migrations

```
ℹ️  Starting database migrations...
✅ Loaded migrations file (2847 bytes)
✅ Parsed 12 SQL statements

ℹ️  Connecting to database...
✅ Connected to database

ℹ️  Executing migrations:

✅ [1/12] Created table
✅ [2/12] Created index
✅ [3/12] Created table
⚠️  [4/12] Already exists (skipped)
✅ [5/12] Created index
⚠️  [6/12] Already exists (skipped)
✅ [7/12] Created table
✅ [8/12] Created index
✅ [9/12] Created index
✅ [10/12] Created index
⚠️  [11/12] Already exists (skipped)
✅ [12/12] Created index

ℹ️  Migration Summary:
✅   10 statements executed
⚠️   2 statements skipped (already exist)

✅ Migrations completed successfully
```

### With Errors

```
ℹ️  Starting database migrations...
✅ Loaded migrations file (2847 bytes)
✅ Parsed 12 SQL statements

ℹ️  Connecting to database...
✅ Connected to database

ℹ️  Executing migrations:

✅ [1/12] Created table
✅ [2/12] Created index
❌ [3/12] Connection timeout

ℹ️  Migration Summary:
✅   2 statements executed
⚠️   0 statements skipped
❌   1 statement failed

❌ Migrations completed with errors
```

Exit code will be `1` (failure) if any errors occur.

---

## Exit Codes

| Code | Meaning                                 |
| ---- | --------------------------------------- |
| 0    | Success - migrations completed          |
| 1    | Failure - one or more migrations failed |

---

## Idempotency

The script is **idempotent** because:

1. All `CREATE TABLE` statements use `IF NOT EXISTS`
2. All `CREATE INDEX` statements use `IF NOT EXISTS`
3. Duplicate key errors are caught and logged as "skipped"
4. The script continues executing even if some statements are skipped

This means you can safely run:

- Multiple times on the same database
- After partial migrations
- Without data loss

---

## Error Handling

### Automatically Handled

- ✅ Table already exists
- ✅ Index already exists
- ✅ Duplicate constraints
- ✅ Connection timeouts (logs warning, continues)
- ✅ Missing DATABASE_URL in development

### Will Fail Startup

- ❌ Actual SQL syntax errors
- ❌ Connection refused (database down)
- ❌ Permission denied (insufficient privileges)

---

## Troubleshooting

### "DATABASE_URL environment variable is not set"

This is expected in development. The script only runs in production when `DATABASE_URL` is set.

**Solution**: Either set `DATABASE_URL` or use the migration in Railway only.

### "Migrations file not found"

The script can't find `DATABASE_MIGRATIONS.sql` in the project root.

**Solution**: Make sure `DATABASE_MIGRATIONS.sql` exists in the same directory as `server.js`

### "Connection refused"

The database is not accessible.

**Solution**: Check `DATABASE_URL` is correct and database is running

### "permission denied for schema public"

The database user doesn't have permissions to create tables.

**Solution**: Grant necessary permissions to the database user

### "statement timeout"

A migration is taking too long.

**Solution**: Check if database is under heavy load, or increase statement_timeout in the script

---

## On Railway

### Automatic Execution (Recommended)

1. Push to main branch: `git push origin main`
2. Railway auto-deploys
3. `server.js` runs migrations automatically
4. Server starts normally

**You don't need to do anything special!**

### Manual Execution (If Needed)

1. Open Railway project
2. Select your app service
3. Click "Deploy" tab
4. Find the latest deployment
5. Click "SSH" (if available) or use Railway CLI:

```bash
# Using Railway CLI
railway run node run-migrations.js

# Or shell into the dyno
railway shell

# Then inside the shell
node run-migrations.js
```

---

## Development vs Production

### Development (Local)

```bash
# DATABASE_URL not set
node server.js
# Output: ⏭️  Skipping migrations (DATABASE_URL not set - development mode)
# Server starts with test data
```

### Production (Railway)

```bash
# DATABASE_URL is set by Railway
node server.js
# Output: 🔄 Running database migrations...
# Migrations run, then server starts
```

---

## What Migrations Are Included

The `DATABASE_MIGRATIONS.sql` file includes:

### Tables Created

1. `magic_links` - Track magic link tokens
2. `email_delivery_logs` - Log all email delivery attempts
3. `login_audit_log` - Audit all login attempts

### Indexes Created

1. `idx_magic_links_token` - Fast token lookup
2. `idx_magic_links_email` - Fast email queries
3. `idx_magic_links_active` - Efficient valid token queries
4. `idx_email_logs_email` - Find email history
5. `idx_email_logs_status` - Find pending/failed emails
6. `idx_email_logs_type` - Filter by email type
7. `idx_email_logs_created` - Recent emails
8. `idx_login_audit_email` - User login history
9. Additional indexes for performance

---

## Monitoring Migrations

### Check Migration Status

After migrations run, verify tables exist:

```sql
-- Check if magic_links table exists and has records
SELECT COUNT(*) FROM magic_links;

-- Check email delivery logs
SELECT COUNT(*) FROM email_delivery_logs;

-- Check login audit
SELECT COUNT(*) FROM login_audit_log;

-- Check all migration tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('magic_links', 'email_delivery_logs', 'login_audit_log');
```

### Check Logs

In Railway:

1. Go to your app
2. Click "Deployments" tab
3. Find latest deployment
4. Look for migration messages in logs:
   - `🔄 Running database migrations...`
   - `✅ Migrations complete:`
   - `⏭️  Skipping migrations:` (development)

---

## Safety

The migration script is designed to be safe:

1. **Read-only first**: Parses migrations without executing
2. **Idempotent**: Safe to run multiple times
3. **Non-blocking**: Doesn't fail server startup if migrations fail
4. **Logged**: Every action is logged with status
5. **Graceful errors**: "Already exists" errors are expected and handled
6. **Transaction aware**: Each statement is individual (not wrapped in transaction)

---

## Next Steps

### After First Deployment

1. Check that migrations ran successfully
2. Verify tables exist: `SELECT COUNT(*) FROM magic_links;`
3. Monitor email delivery in `email_delivery_logs` table
4. Watch login attempts in `login_audit_log` table

### If Issues

1. Check Sentry for errors
2. Review Railway logs for migration output
3. Query database to verify tables exist
4. Manually check `DATABASE_MIGRATIONS.sql` content

---

## Reference

- **Script Location**: `run-migrations.js` (in project root)
- **Migrations File**: `DATABASE_MIGRATIONS.sql` (in project root)
- **Server Integration**: `server.js` lines 303-365 (approximately)
- **Runs**: Automatically on Railway startup when `DATABASE_URL` is set
- **Manual**: `node run-migrations.js`

---

## Support

If migrations fail:

1. **Check logs**: Look for the specific error message
2. **Check database**: Is it running and accessible?
3. **Check permissions**: Does the user have CREATE TABLE permission?
4. **Check syntax**: Is `DATABASE_MIGRATIONS.sql` valid?
5. **Check connection**: Is `DATABASE_URL` correct?

For more help, see `DEPLOYMENT_GUIDE.md` or `MAGIC_LINK_TROUBLESHOOTING.md`
