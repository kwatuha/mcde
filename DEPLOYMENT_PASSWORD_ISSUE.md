# Database Password Issue After Deployment

## Problem

After deployment, the database connection fails with "password authentication failed for user postgres" errors.

## Root Cause

The PostgreSQL password gets reset or changed during/after deployment, causing authentication failures.

## Diagnosis Results

### What We Found

1. **Containers**: All running and healthy ✅
2. **Network**: Connectivity is fine (ping works) ✅
3. **Environment Variables**: Correctly set (DB_PASSWORD=postgres) ✅
4. **PostgreSQL User**: Exists and is superuser ✅
5. **Password**: Was incorrect/mismatched ❌

### Error Pattern

```
FATAL: password authentication failed for user "postgres"
DETAIL: Connection matched file "/var/lib/postgresql/data/pg_hba.conf" line 128: "host all all all scram-sha-256"
```

## Solution

### Immediate Fix

Reset the PostgreSQL password to match docker-compose.yml:

```bash
docker exec gov_postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
docker-compose restart api
```

### Why This Happens

1. **Database Volume Persistence**: The PostgreSQL data volume persists between deployments
2. **Password Changes**: If the password was changed manually or by a script, it persists
3. **Deployment Process**: The deployment script doesn't reset the password
4. **No Password Sync**: There's no mechanism to ensure the password matches docker-compose.yml

## Prevention

### Option 1: Add Password Reset to Deployment Script

Add this to `deploy-gprs-server.sh` after starting containers:

```bash
# Reset PostgreSQL password to match configuration
docker exec gov_postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" 2>/dev/null || true
```

### Option 2: Use Environment Variable for Password

Update `docker-compose.yml`:

```yaml
postgres_db:
  environment:
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
```

Then set it in deployment or use a `.env` file.

### Option 3: Add to Health Check Script

Add password verification to the diagnostic script:

```bash
# Verify password matches
docker exec gov_postgres psql -U postgres -c "SELECT 1;" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Password mismatch detected. Resetting..."
    docker exec gov_postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';"
fi
```

### Option 4: Add to Container Startup

Create an initialization script that runs on container start to ensure password is correct.

## Recommended Solution

**Add password reset to deployment script** - This ensures the password is always correct after deployment.

Update `deploy-gprs-server.sh` in the `deploy_on_server` function:

```bash
# After starting containers, reset password
print_status "Verifying database password..."
docker exec gov_postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" 2>/dev/null || true
```

## Verification

After fixing, verify:

```bash
# Check API can connect
docker-compose logs api | grep "PostgreSQL connection pool created and tested successfully"

# Check no authentication errors
docker-compose logs postgres_db | grep -i "FATAL.*password" | tail -5

# Test connection
docker exec gov_postgres psql -U postgres -d government_projects -c "SELECT NOW();"
```

## Current Status

✅ **Fixed**: Password reset and API restarted  
✅ **Verified**: Connection working ("PostgreSQL connection pool created and tested successfully")  
⚠️ **Action Needed**: Add password reset to deployment script to prevent recurrence
