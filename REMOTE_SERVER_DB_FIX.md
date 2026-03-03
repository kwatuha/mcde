# Remote Server Database Connection Fix

## Situation
- **Local server**: App + Database (Docker) - ✅ Works perfectly
- **Remote server (102.210.149.119)**: App + Database (deployed) - ❌ Connection unstable

The app on the remote server connects to the database on the same remote server using Docker container networking (`postgres_db` hostname).

## Changes Made

### 1. Database Connection Pool Improvements (`api/config/db.js`)

**Fixed Issues:**
- ✅ Increased connection timeout: 2s → 10s (for network latency)
- ✅ Increased idle timeout: 30s → 5 minutes (prevents premature connection closure)
- ✅ Added TCP keepalive (prevents silent connection drops)
- ✅ Added automatic retry logic (3 retries for connection errors)
- ✅ Added connection validation (detects stale connections)
- ✅ Added error handling and logging
- ✅ Increased pool size: 10 → 20 connections

### 2. PostgreSQL Server Configuration (`docker-compose.yml`)

**Added PostgreSQL settings:**
- ✅ `max_connections=200` (increased from default 100)
- ✅ `tcp_keepalives_idle=600` (10 minutes - keep connections alive)
- ✅ `tcp_keepalives_interval=30` (check every 30 seconds)
- ✅ `tcp_keepalives_count=3` (3 failed checks before closing)
- ✅ `statement_timeout=30000` (30 second query timeout)

## Will These Changes Fix the Issue?

**YES, these changes should resolve the unstable connection issue because:**

1. **Connection Timeout**: The 2-second timeout was too short for Docker container networking, especially if the database container is under load. 10 seconds gives enough time.

2. **Idle Timeout**: 30 seconds was too aggressive. Connections were being closed too quickly, causing connection churn. 5 minutes is more reasonable.

3. **Keepalive**: This is critical! Without keepalive, connections can be silently dropped by the network or database server. The keepalive settings ensure connections stay alive.

4. **Retry Logic**: If a connection fails temporarily, it will automatically retry instead of immediately failing.

5. **Connection Validation**: Stale connections are detected and replaced before use.

6. **PostgreSQL Settings**: The server-side keepalive settings ensure PostgreSQL doesn't close idle connections prematurely.

## Deployment Steps

### 1. Deploy the Changes

```bash
# From your local machine
./deploy-gprs-server.sh
```

### 2. Verify Deployment

SSH to the remote server and check:

```bash
ssh -i ~/.ssh/id_gprs_server fortress@102.210.149.119
cd /home/fortress/gprs

# Check containers are running
docker-compose ps

# Check API logs for connection messages
docker-compose logs -f api | grep -i "connection\|postgres"
```

Look for:
- ✅ "PostgreSQL connection pool created and tested successfully"
- ✅ "New database client connected"
- ❌ Any "connection error" or "timeout" messages

### 3. Run Diagnostics

```bash
# On the remote server
cd /home/fortress/gprs
./scripts/diagnose-remote-db.sh
```

This will check:
- Container status
- Network connectivity
- Database health
- Connection counts
- Resource usage
- Error logs

## Additional Troubleshooting

### If Issues Persist

#### 1. Check PostgreSQL Connection Limits

```bash
# On remote server
docker exec gov_postgres psql -U postgres -c "SHOW max_connections;"
docker exec gov_postgres psql -U postgres -d government_projects -c "
SELECT 
    count(*) as active_connections,
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
FROM pg_stat_activity 
WHERE datname = 'government_projects';
"
```

If you're hitting the limit, increase `max_connections` in docker-compose.yml.

#### 2. Check Container Networking

```bash
# Verify containers are on the same network
docker network inspect government_projects_default | grep -A 5 "gov_node_api\|gov_postgres"

# Test connectivity
docker exec gov_node_api ping -c 3 postgres_db
docker exec gov_node_api nc -zv postgres_db 5432
```

#### 3. Check Resource Constraints

```bash
# Check if containers are resource-constrained
docker stats --no-stream

# Check system resources
free -h
df -h
```

#### 4. Check PostgreSQL Logs

```bash
# Check for connection errors in PostgreSQL logs
docker-compose logs postgres_db | grep -i "error\|connection\|timeout"

# Check recent logs
docker-compose logs --tail=50 postgres_db
```

#### 5. Test Direct Connection

```bash
# Test connection from API container
docker exec gov_node_api sh -c 'PGPASSWORD=postgres psql -h postgres_db -U postgres -d government_projects -c "SELECT NOW();"'
```

#### 6. Monitor Connection Pool

Add this to your API to monitor the connection pool:

```javascript
// In api/app.js or a route
setInterval(async () => {
    const pool = require('./config/db');
    const stats = {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
    };
    console.log('Pool stats:', stats);
}, 60000); // Every minute
```

## Expected Behavior After Fix

- ✅ Connections remain stable for extended periods
- ✅ Automatic reconnection on transient failures
- ✅ No "connection refused" errors after initial startup
- ✅ Connections survive idle periods
- ✅ Graceful handling of network interruptions

## Monitoring

Watch the API logs for these indicators:

**Good signs:**
- "PostgreSQL connection pool created and tested successfully"
- "New database client connected" (occasional, not excessive)
- No connection errors

**Bad signs:**
- Frequent "Database connection error" messages
- "Connection validation failed"
- "Failed to get database connection after retries"
- "Connection timeout" errors

## Summary

The changes address the root causes of unstable database connections:
1. **Too short timeouts** → Increased
2. **No keepalive** → Added
3. **No retry logic** → Added
4. **No connection validation** → Added
5. **PostgreSQL server settings** → Optimized

These should resolve the issue on the remote server. The configuration is now more robust and handles network issues, container restarts, and connection drops gracefully.
