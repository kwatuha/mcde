# PostgreSQL Password Sync Solution

## Problem

The PostgreSQL password keeps getting out of sync, causing authentication failures after:
- Multiple users connect
- Container restarts
- Deployments
- Database operations

## Root Cause

The `POSTGRES_PASSWORD` environment variable in docker-compose.yml **only sets the password on first database initialization**. Once the database volume exists, the password in the volume takes precedence, and it may differ from the environment variable.

## Why It Happens

1. **Volume Persistence**: The `gov_postgres_data` volume persists between container restarts
2. **Password in Volume**: The password stored in the volume may be different from docker-compose.yml
3. **No Automatic Sync**: There's no mechanism to sync the password after the database is initialized
4. **Manual Changes**: If someone manually changes the password, it persists in the volume

## Solution Implemented

### 1. Enhanced Deployment Script

Updated `deploy-gprs-server.sh` to:
- Wait for PostgreSQL to be ready
- Reset password to match configuration
- Verify password works before continuing

### 2. Created Password Verification Script

Created `scripts/ensure-postgres-password.sh` that can be:
- Run manually when needed
- Added to cron for periodic checks
- Called from monitoring scripts

## Immediate Fix Applied

✅ Password reset: `ALTER USER postgres WITH PASSWORD 'postgres';`  
✅ API restarted and reconnected successfully  
✅ Connection verified: "PostgreSQL connection pool created and tested successfully"

## Long-Term Solutions

### Option 1: Periodic Password Sync (Recommended)

Add a cron job on the server to periodically verify and reset the password:

```bash
# Add to crontab (runs every hour)
0 * * * * cd /home/fortress/gprs && docker exec gov_postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" > /dev/null 2>&1
```

### Option 2: Startup Script

Create a script that runs on container startup to ensure password is correct. However, this requires modifying the PostgreSQL container's entrypoint, which is complex.

### Option 3: Use .pgpass File

Create a `.pgpass` file, but this doesn't solve the root cause - it just works around it.

### Option 4: Monitor and Auto-Fix

Add password verification to the diagnostic script and automatically fix it:

```bash
# In diagnose-remote-db.sh, add:
if ! docker exec gov_postgres psql -U postgres -c "SELECT 1;" > /dev/null 2>&1; then
    echo "Password mismatch detected. Resetting..."
    docker exec gov_postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
fi
```

## Recommended Approach

**Use a combination:**

1. ✅ **Deployment script** - Resets password after each deployment (already done)
2. ✅ **Periodic cron job** - Verifies password every hour
3. ✅ **Monitoring** - Add to diagnostic script for manual checks

## Setting Up Cron Job

SSH to the server and run:

```bash
ssh -i ~/.ssh/id_gprs_server fortress@102.210.149.119

# Edit crontab
crontab -e

# Add this line (runs every hour at minute 0):
0 * * * * cd /home/fortress/gprs && docker exec gov_postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" > /dev/null 2>&1

# Save and exit
```

## Verification

After setting up, verify:

```bash
# Check cron job is set
crontab -l | grep postgres

# Manually test the command
docker exec gov_postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"

# Verify it works
docker exec gov_postgres psql -U postgres -c "SELECT 1;"
```

## Current Status

✅ **Fixed**: Password reset and API reconnected  
✅ **Deployment Script**: Enhanced to verify password  
✅ **Script Created**: `scripts/ensure-postgres-password.sh` for manual use  
⚠️ **Action Needed**: Set up cron job for automatic password sync

## Why This Keeps Happening

The password issue recurs because:
- The database volume persists the old password
- No automatic mechanism to sync password after initialization
- Manual operations or scripts might change the password
- Container restarts don't reset the password (volume persists)

The cron job solution ensures the password is always correct, even if something changes it.
